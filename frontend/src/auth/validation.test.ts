import { describe, expect, it } from "vitest";
import { validateAuthDraft } from "./validation";

const valid = {
  name: "Анна",
  email: "anna@example.test",
  password: "valid-password",
  confirmation: "valid-password",
};

describe("Account validation", () => {
  it("counts Unicode code points consistently with server password bounds", () => {
    for (const length of [9, 128]) {
      const password = "🔬".repeat(length);
      expect(
        validateAuthDraft("register", {
          ...valid,
          password,
          confirmation: password,
        }),
      ).toEqual({});
    }
    for (const length of [8, 129]) {
      const password = "🔬".repeat(length);
      expect(
        validateAuthDraft("register", {
          ...valid,
          password,
          confirmation: password,
        }),
      ).toHaveProperty("password");
    }
  });
  it.each([" ", "\t", "\n", "\r", "\u00a0", "\u2003"])(
    "rejects whitespace %j during signup without trimming or rejecting existing credentials",
    (whitespace) => {
      const password = `valid${whitespace}password`;
      const draft = { ...valid, password, confirmation: password };
      expect(validateAuthDraft("register", draft)).toEqual({
        password: "Пароль не должен содержать пробелы.",
      });
      expect(validateAuthDraft("login", draft)).toEqual({});
      expect(draft.password).toBe(password);
    },
  );
  it("requires a long new password but lets the server verify short existing credentials", () => {
    expect(
      validateAuthDraft("register", {
        ...valid,
        password: "short",
        confirmation: "short",
      }),
    ).toHaveProperty("password");
    expect(validateAuthDraft("login", { ...valid, password: "short" })).toEqual(
      {},
    );
  });
});
