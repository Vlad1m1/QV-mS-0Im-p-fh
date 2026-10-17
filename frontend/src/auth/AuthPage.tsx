import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  History,
  LoaderCircle,
  NotebookPen,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "../api/client";
import { useAuth } from "./AuthProvider";
import { validateAuthDraft } from "./validation";
import type { AuthDraft, AuthErrors, AuthField, AuthMode } from "./validation";

function AuthBrand() {
  return (
    <p className="auth-brand">
      <strong>PersonalJournal</strong>
    </p>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <aside className="auth-page__intro">
        <AuthBrand />
        <section
          className="auth-intro"
          aria-label="Возможности PersonalJournal"
        >
          <h2 className="auth-intro__title">
            Эксперименты без потерянных данных.
          </h2>
          <Separator />
          <div className="auth-intro__features">
            <div className="auth-feature">
              <NotebookPen className="auth-feature__icon" aria-hidden="true" />
              <div className="auth-feature__body">
                <p className="auth-feature__title">Структура каждой попытки</p>
                <p className="auth-feature__description">
                  Параметры, единицы измерения и результат рядом.
                </p>
              </div>
            </div>
            <div className="auth-feature">
              <History className="auth-feature__icon" aria-hidden="true" />
              <div className="auth-feature__body">
                <p className="auth-feature__title">История изменений</p>
                <p className="auth-feature__description">
                  Автор и время записи. Предыдущие значения сохраняются.
                </p>
              </div>
            </div>
            <div className="auth-feature">
              <Users className="auth-feature__icon" aria-hidden="true" />
              <div className="auth-feature__body">
                <p className="auth-feature__title">
                  Совместная работа по выбору
                </p>
                <p className="auth-feature__description">
                  Участников вы определяете для каждого эксперимента.
                </p>
              </div>
            </div>
          </div>
        </section>
      </aside>
      <main className="auth-page__access">
        <div className="auth-page__mobile-brand">
          <AuthBrand />
        </div>
        <div className="auth-page__content">{children}</div>
      </main>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  autoComplete,
  error,
  disabled,
  onChange,
}: {
  id: "password" | "confirmation";
  label: string;
  value: string;
  autoComplete: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <Label htmlFor={id}>{label}</Label>
      <div className="auth-password">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="auth-password__input"
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="auth-password__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? "Скрыть" : "Показать"} ${id === "confirmation" ? "подтверждение пароля" : "пароль"}`}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {error && (
        <p className="auth-field__message" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [draft, setDraft] = useState<AuthDraft>({
    name: "",
    email: "",
    password: "",
    confirmation: "",
  });
  const [errors, setErrors] = useState<AuthErrors>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const registration = mode === "register";
  const update = (field: AuthField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
  };
  const changeMode = (next: string) => {
    if ((next !== "login" && next !== "register") || pending || next === mode)
      return;
    setMode(next);
    setDraft((current) => ({ ...current, password: "", confirmation: "" }));
    setErrors({});
    setError("");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const validation = validateAuthDraft(mode, draft);
    setErrors(validation);
    setError("");
    const firstInvalid = Object.keys(validation)[0];
    if (firstInvalid) {
      form.current
        ?.querySelector<HTMLInputElement>(`#${firstInvalid}`)
        ?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const credentials = {
        email: draft.email.trim(),
        password: draft.password,
      };
      if (registration)
        await register({ ...credentials, name: draft.name.trim() });
      else await login(credentials);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <Card className="auth-card">
        <CardContent className="auth-card__content">
          <Tabs value={mode} onValueChange={changeMode}>
            <TabsList className="auth-card__tabs" aria-label="Способ входа">
              <TabsTrigger value="login" disabled={pending}>
                Вход
              </TabsTrigger>
              <TabsTrigger value="register" disabled={pending}>
                Регистрация
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value={mode}
              className="auth-card__panel"
              tabIndex={-1}
            >
              <form
                ref={form}
                onSubmit={submit}
                noValidate
                className={`auth-form${registration ? " auth-form--register" : ""}`}
                aria-label={
                  registration ? "Регистрация пользователя" : "Вход в журнал"
                }
                aria-busy={pending}
              >
                {registration && (
                  <div className="auth-field">
                    <Label htmlFor="name">Ваше имя</Label>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      maxLength={100}
                      placeholder="Как к вам обращаться"
                      value={draft.name}
                      onChange={(event) => update("name", event.target.value)}
                      disabled={pending}
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? "name-error" : undefined}
                      required
                    />
                    {errors.name && (
                      <p className="auth-field__message" id="name-error">
                        {errors.name}
                      </p>
                    )}
                  </div>
                )}
                <div className="auth-field">
                  <Label htmlFor="email">Электронная почта</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    placeholder="name@university.ru"
                    value={draft.email}
                    onChange={(event) => update("email", event.target.value)}
                    disabled={pending}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    required
                  />
                  {errors.email && (
                    <p className="auth-field__message" id="email-error">
                      {errors.email}
                    </p>
                  )}
                </div>
                <PasswordField
                  id="password"
                  label="Пароль"
                  value={draft.password}
                  autoComplete={
                    registration ? "new-password" : "current-password"
                  }
                  error={errors.password}
                  disabled={pending}
                  onChange={(value) => update("password", value)}
                />
                {registration && (
                  <PasswordField
                    id="confirmation"
                    label="Повторите пароль"
                    value={draft.confirmation}
                    autoComplete="new-password"
                    error={errors.confirmation}
                    disabled={pending}
                    onChange={(value) => update("confirmation", value)}
                  />
                )}
                {error && (
                  <p className="auth-field__message" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  className="auth-form__submit"
                  type="submit"
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <LoaderCircle className="auth-spinner" />
                      {registration
                        ? "Создаём учётную запись…"
                        : "Входим в журнал…"}
                    </>
                  ) : (
                    <>
                      {registration
                        ? "Создать учётную запись"
                        : "Войти в журнал"}
                      <ArrowRight />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
