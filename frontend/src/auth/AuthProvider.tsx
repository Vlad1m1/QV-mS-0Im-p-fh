import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ApiError, errorMessage } from "../api/client";
import {
  replaceSessionToken,
  subscribeToExpiration,
} from "../api/sessionTransport";
import { authApi } from "./authApi";
import type { AuthSession, LoginInput, RegistrationInput } from "./models";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "anonymous" }
  | { status: "authenticated"; session: AuthSession; generation: number };

function useAuthController() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);
  const operation = useRef(0);
  const activeSession = useRef<Extract<
    AuthState,
    { status: "authenticated" }
  > | null>(null);
  const checking = useRef<AbortController | null>(null);
  const authenticating = useRef(false);
  const logoutInFlight = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const acceptSession = useCallback((session: AuthSession) => {
    const previous = activeSession.current;
    const generation =
      previous?.session.csrf_token === session.csrf_token &&
      previous.session.user.id === session.user.id
        ? previous.generation
        : replaceSessionToken(session.csrf_token);
    const next = { status: "authenticated" as const, session, generation };
    activeSession.current = next;
    setState(next);
  }, []);
  const forgetSession = useCallback(() => {
    operation.current++;
    activeSession.current = null;
    replaceSessionToken(null);
    setState({ status: "anonymous" });
  }, []);

  useEffect(
    () =>
      subscribeToExpiration(() => {
        // A late logout response can still delete the browser cookie. Do not expose
        // a new login form until that response has finished, even if polling gets 401.
        if (!logoutInFlight.current) forgetSession();
      }),
    [forgetSession],
  );
  const checkSession = useCallback(
    (silent = false) => {
      checking.current?.abort();
      const controller = new AbortController();
      checking.current = controller;
      const revision = ++operation.current;
      if (!silent) {
        activeSession.current = null;
        replaceSessionToken(null);
        setState({ status: "loading" });
      }
      void authApi.session(controller.signal).then(
        (session) => {
          if (!controller.signal.aborted && revision === operation.current)
            acceptSession(session);
        },
        (error: unknown) => {
          if (controller.signal.aborted || revision !== operation.current)
            return;
          if (error instanceof ApiError && error.status === 401)
            forgetSession();
          else if (!silent || !activeSession.current) {
            activeSession.current = null;
            replaceSessionToken(null);
            setState({ status: "error", message: errorMessage(error) });
          }
        },
      );
    },
    [acceptSession, forgetSession],
  );
  useEffect(() => {
    checkSession();
    return () => {
      operation.current++;
      checking.current?.abort();
    };
  }, [checkSession]);

  useEffect(() => {
    if (typeof window.BroadcastChannel !== "undefined") {
      const connection = new window.BroadcastChannel("labnote-auth");
      channel.current = connection;
      connection.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === "session-changed" && !authenticating.current)
          checkSession();
      };
    }
    const onFocus = () => {
      if (activeSession.current && !authenticating.current) checkSession(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [checkSession]);

  const authenticate = async (action: () => Promise<AuthSession>) => {
    checking.current?.abort();
    const revision = ++operation.current;
    authenticating.current = true;
    try {
      const session = await action();
      if (revision === operation.current) {
        acceptSession(session);
        channel.current?.postMessage("session-changed");
      }
    } finally {
      authenticating.current = false;
    }
  };
  const login = (input: LoginInput) => authenticate(() => authApi.login(input));
  const register = (input: RegistrationInput) =>
    authenticate(() => authApi.register(input));
  const logout = async () => {
    if (logoutInFlight.current) return;
    checking.current?.abort();
    const revision = operation.current;
    authenticating.current = true;
    logoutInFlight.current = true;
    setLoggingOut(true);
    try {
      await authApi.logout();
      // Network failures leave both the authenticated UI and the session intact.
      if (revision === operation.current) {
        forgetSession();
        channel.current?.postMessage("session-changed");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) forgetSession();
      else if (activeSession.current)
        replaceSessionToken(activeSession.current.session.csrf_token);
      throw error;
    } finally {
      authenticating.current = false;
      logoutInFlight.current = false;
      setLoggingOut(false);
    }
  };
  return {
    state,
    login,
    register,
    logout,
    loggingOut,
    retry: () => checkSession(),
  };
}

const AuthContext = createContext<ReturnType<typeof useAuthController> | null>(
  null,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={useAuthController()}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}

export function useAuthenticatedUser() {
  const { state } = useAuth();
  if (state.status !== "authenticated")
    throw new Error("An authenticated session is required");
  return state.session.user;
}
