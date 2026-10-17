export type AuthMode = "login" | "register";
export type AuthField = "name" | "email" | "password" | "confirmation";
export interface AuthDraft {
  name: string;
  email: string;
  password: string;
  confirmation: string;
}
export type AuthErrors = Partial<Record<AuthField, string>>;

export function validateAuthDraft(
  mode: AuthMode,
  draft: AuthDraft,
): AuthErrors {
  const errors: AuthErrors = {};
  const passwordLength = Array.from(draft.password).length;
  if (
    mode === "register" &&
    (draft.name.trim().length < 1 || draft.name.trim().length > 100)
  )
    errors.name = "Укажите имя длиной от 1 до 100 символов.";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) ||
    draft.email.trim().length > 254
  )
    errors.email = "Введите корректный адрес электронной почты.";
  if (!draft.password) errors.password = "Введите пароль.";
  else if (passwordLength > 128 || (mode === "register" && passwordLength < 9))
    errors.password =
      mode === "register"
        ? "Пароль должен содержать от 9 до 128 символов."
        : "Пароль не может быть длиннее 128 символов.";
  else if (mode === "register" && /\s/u.test(draft.password))
    errors.password = "Пароль не должен содержать пробелы.";
  if (mode === "register" && draft.confirmation !== draft.password)
    errors.confirmation = "Пароли не совпадают.";
  return errors;
}
