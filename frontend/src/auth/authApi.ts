import { request, requestEmpty } from "../api/client";
import type { AuthSession, LoginInput, RegistrationInput } from "./models";

export const authApi = {
  session: (signal: AbortSignal) =>
    request<AuthSession>("/auth/session", { signal }, false),
  login: (input: LoginInput) =>
    request<AuthSession>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(input) },
      false,
    ),
  register: (input: RegistrationInput) =>
    request<AuthSession>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(input) },
      false,
    ),
  logout: () => requestEmpty("/auth/logout", { method: "POST" }),
};
