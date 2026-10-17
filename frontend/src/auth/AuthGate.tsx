import type { ReactNode } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "./AuthProvider";
import { AuthLayout, AuthPage } from "./AuthPage";

export function AuthGate({ children }: { children: ReactNode }) {
  const { state, retry, loggingOut } = useAuth();
  if (state.status === "loading") return null;
  if (state.status === "authenticated")
    return (
      <>
        <div inert={loggingOut}>{children}</div>
        {loggingOut && (
          <div className="auth-logout" role="status">
            <Card className="auth-logout__card">
              <CardContent className="auth-logout__content">
                <LoaderCircle className="auth-spinner" aria-hidden="true" />
                <span className="auth-logout__message">Завершаем сеанс…</span>
              </CardContent>
            </Card>
          </div>
        )}
      </>
    );
  if (state.status === "anonymous") return <AuthPage />;
  return (
    <AuthLayout>
      <Card className="auth-session">
        <CardHeader>
          <CardTitle className="auth-session__title">
            <h1>Не удалось подключиться</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="auth-session__error">
            <Alert>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
            <Button className="auth-session__retry" onClick={retry}>
              <RefreshCw />
              Повторить подключение
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
