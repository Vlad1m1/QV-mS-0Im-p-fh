// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../App";
import { request } from "../api/client";
import { captureSession, replaceSessionToken } from "../api/sessionTransport";
import { authSession } from "../test/auth";
import { experiment } from "../test/fixtures";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const unauthorized = () =>
  Response.json({ detail: "Войдите в журнал" }, { status: 401 });
function journalResponse(path: string, title = "Исследование группы") {
  if (path === "/api/authors")
    return Response.json([{ id: 1, name: "Анна Петрова" }]);
  if (path === "/api/experiments/1")
    return Response.json({ ...experiment(), title });
  if (path.startsWith("/api/experiments"))
    return Response.json([
      { ...experiment(), title, attempt_count: 2, event_count: 3 },
    ]);
  throw new Error(`Unexpected request: ${path}`);
}
function fillLogin() {
  fireEvent.change(screen.getByLabelText("Электронная почта"), {
    target: { value: "anna@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Пароль", { selector: "input" }), {
    target: { value: "  correct password  " },
  });
}
beforeEach(() => {
  replaceSessionToken(null);
  localStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  replaceSessionToken(null);
  vi.unstubAllGlobals();
});

describe("Authentication boundary", () => {
  it("shows an empty personal journal and no automatic colleagues for a new account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/auth/session") return Response.json(authSession());
        if (path === "/api/authors")
          return Response.json([{ id: 1, name: "Анна Петрова" }]);
        if (path === "/api/experiments") return Response.json([]);
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(<App />);
    await screen.findByRole("heading", {
      name: "Начните с первого эксперимента",
    });
    const brand = screen.getByRole("link", { name: "PersonalJournal" });
    expect(brand.querySelector("strong")?.textContent).toBe("PersonalJournal");
    expect(brand.querySelector("svg, img")).toBeNull();
    expect(screen.queryByText("Мой лабораторный журнал")).toBeNull();
    expect(screen.queryByText("Личные и совместные работы")).toBeNull();
    expect(
      screen.queryByText(
        "История сохраняет авторов и предыдущие значения записей.",
      ),
    ).toBeNull();
    expect(screen.getByText(/Пока нет совместных работ/)).toBeTruthy();
    expect(screen.queryByText("Участники группы")).toBeNull();
    expect(screen.queryByText("Учебные данные.")).toBeNull();
    expect(document.querySelectorAll(".journal-sidebar__person")).toHaveLength(
      0,
    );
    expect(
      screen.getByRole("button", { name: "Создать эксперимент" }),
    ).toBeTruthy();
  });

  it("uses the creator's stable number in the card and detail and the experiment title in the breadcrumb", async () => {
    const record = {
      ...experiment(),
      id: 93,
      number: 1,
      title: "Моя первая работа",
      attempt_count: 0,
      event_count: 1,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/auth/session") return Response.json(authSession());
        if (path === "/api/authors")
          return Response.json([{ id: 1, name: "Анна Петрова" }]);
        if (path === "/api/experiments") return Response.json([record]);
        if (path === "/api/experiments/93") return Response.json(record);
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(<App />);
    await screen.findByText("EXP · 001");
    expect(screen.queryByText("EXP · 093")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Моя первая работа" }));
    await screen.findByRole("heading", { name: "Моя первая работа" });
    expect(
      screen.getByText("Моя первая работа", {
        selector: "[aria-current=page]",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/ЭКСПЕРИМЕНТ 001/, {
        selector: ".experiment-detail__number",
      }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Участники эксперимента").textContent,
    ).toContain("Анна Петрова");
  });

  it("does not fetch protected data before checking the session, and returns to the saved experiment after login", async () => {
    history.replaceState(null, "", "/#experiment=1");
    const initial = deferred<Response>();
    const fetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/session") return initial.promise;
      if (path === "/api/auth/login") {
        expect(JSON.parse(String(init?.body))).toEqual({
          email: "anna@example.test",
          password: "  correct password  ",
        });
        expect(init?.credentials).toBe("same-origin");
        return Response.json(authSession());
      }
      return journalResponse(path);
    });
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    expect(screen.queryByText("Проверяем сеанс…")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Открываем ваш журнал" }),
    ).toBeNull();
    expect(screen.queryByRole("form", { name: "Вход в журнал" })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      initial.resolve(unauthorized());
    });
    await screen.findByRole("form", { name: "Вход в журнал" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "Войти в журнал" }));
    await screen.findByRole("heading", { name: "Исследование группы" });
    expect(location.hash).toBe("#experiment=1");
    expect(screen.queryByLabelText("Текущий участник")).toBeNull();
    expect(screen.getByText("anna@example.test")).toBeTruthy();
    expect(localStorage.length).toBe(0);
    expect(captureSession().csrfToken).toBe("test-csrf-1");
  });

  it("shows an incorrect login error without rechecking the session or leaving the form", async () => {
    const fetch = vi.fn(async (path: string) =>
      path === "/api/auth/session"
        ? unauthorized()
        : Response.json(
            { detail: "Неверная почта или пароль" },
            { status: 401 },
          ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    await screen.findByRole("form", { name: "Вход в журнал" });
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "Войти в журнал" }));
    const error = await screen.findByRole("alert");
    expect(error.textContent).toBe("Неверная почта или пароль");
    expect(error.tagName).toBe("P");
    expect(error.className).toBe("auth-field__message");
    expect(screen.getByRole("form", { name: "Вход в журнал" })).toBeTruthy();
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/session",
      "/api/auth/login",
    ]);
  });

  it("uses a text-only PersonalJournal brand and compact signup without the removed copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => unauthorized()),
    );
    render(<App />);
    await screen.findByRole("form", { name: "Вход в журнал" });
    const brands = document.querySelectorAll(".auth-brand");
    expect(brands.length).toBeGreaterThan(0);
    for (const brand of brands) {
      expect(brand.textContent).toBe("PersonalJournal");
      expect(brand.querySelector("svg, img")).toBeNull();
    }
    expect(screen.queryByText("Пространство для исследований")).toBeNull();
    expect(screen.queryByText("Общий лабораторный журнал")).toBeNull();
    expect(
      screen.queryByText(
        "Авторство ваших записей определяется учётной записью.",
      ),
    ).toBeNull();
    expect(
      screen.queryByText("Ваш журнал. Доступ по вашему выбору."),
    ).toBeNull();
    expect(
      screen.queryByText(/Гипотезы, измерения и результаты в одном журнале/),
    ).toBeNull();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Регистрация" }), {
      key: "Enter",
    });
    expect(screen.queryByText("Начните свой лабораторный журнал.")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Создать аккаунт" }),
    ).toBeNull();
    expect(
      screen.queryByText(
        "Ваш новый журнал будет пустым. Совместные эксперименты доступны только выбранным участникам.",
      ),
    ).toBeNull();
    expect(
      screen.queryByText("Это имя будет указано у ваших записей."),
    ).toBeNull();
    expect(
      screen.queryByText("От 12 до 128 символов. Можно использовать пробелы."),
    ).toBeNull();
    expect(
      screen.getByLabelText("Ваше имя").getAttribute("aria-describedby"),
    ).toBeNull();
    expect(
      screen
        .getByLabelText("Пароль", { selector: "input" })
        .getAttribute("aria-describedby"),
    ).toBeNull();
  });

  it("renders a duplicate signup conflict as plain error text and preserves the entered fields", async () => {
    const message =
      "Не удалось создать аккаунт: email или имя участника уже используются.";
    const fetch = vi.fn(async (path: string) =>
      path === "/api/auth/session"
        ? unauthorized()
        : Response.json({ detail: message }, { status: 409 }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    fireEvent.keyDown(await screen.findByRole("tab", { name: "Регистрация" }), {
      key: "Enter",
    });
    fireEvent.change(screen.getByLabelText("Ваше имя"), {
      target: { value: "Анна" },
    });
    fireEvent.change(screen.getByLabelText("Электронная почта"), {
      target: { value: "anna@example.test" },
    });
    for (const label of ["Пароль", "Повторите пароль"]) {
      fireEvent.change(screen.getByLabelText(label, { selector: "input" }), {
        target: { value: "123456789" },
      });
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Создать учётную запись" }),
    );
    const error = await screen.findByRole("alert");
    expect(error.textContent).toBe(message);
    expect(error.tagName).toBe("P");
    expect(error.className).toBe("auth-field__message");
    expect((screen.getByLabelText("Ваше имя") as HTMLInputElement).value).toBe(
      "Анна",
    );
    expect(
      (screen.getByLabelText("Электронная почта") as HTMLInputElement).value,
    ).toBe("anna@example.test");
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/session",
      "/api/auth/register",
    ]);
  });

  it("validates signup fields locally, focuses the first invalid field, and never truncates a password", async () => {
    const fetch = vi.fn(async () => unauthorized());
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    fireEvent.keyDown(await screen.findByRole("tab", { name: "Регистрация" }), {
      key: "Enter",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Создать учётную запись" }),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Ваше имя"));
    expect(
      screen.getByText("Укажите имя длиной от 1 до 100 символов."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Ваше имя"), {
      target: { value: "Анна" },
    });
    fireEvent.change(screen.getByLabelText("Электронная почта"), {
      target: { value: "anna@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Пароль", { selector: "input" }), {
      target: { value: "x".repeat(129) },
    });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), {
      target: { value: "different" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Создать учётную запись" }),
    );
    expect(
      screen.getByText("Пароль должен содержать от 9 до 128 символов."),
    ).toBeTruthy();
    expect(screen.getByText("Пароли не совпадают.")).toBeTruthy();
    expect(
      (
        screen.getByLabelText("Пароль", {
          selector: "input",
        }) as HTMLInputElement
      ).value,
    ).toHaveLength(129);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("registers once while pending, preserves the exact password, and sends neither confirmation nor an author ID", async () => {
    const registration = deferred<Response>();
    let body: unknown;
    const fetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/session") return unauthorized();
      if (path === "/api/auth/register") {
        body = JSON.parse(String(init?.body));
        return registration.promise;
      }
      return journalResponse(path);
    });
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    fireEvent.keyDown(await screen.findByRole("tab", { name: "Регистрация" }), {
      key: "Enter",
    });
    fillLogin();
    fireEvent.change(screen.getByLabelText("Пароль", { selector: "input" }), {
      target: { value: "ExactPassword2026!" },
    });
    fireEvent.change(screen.getByLabelText("Ваше имя"), {
      target: { value: "  Анна Петрова  " },
    });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), {
      target: { value: "ExactPassword2026!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(
      (
        screen.getByLabelText("Пароль", {
          selector: "input",
        }) as HTMLInputElement
      ).type,
    ).toBe("text");
    const form = screen.getByRole("form", { name: "Регистрация пользователя" });
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(screen.getByText("Создаём учётную запись…")).toBeTruthy();
    expect(body).toEqual({
      name: "Анна Петрова",
      email: "anna@example.test",
      password: "ExactPassword2026!",
    });
    expect(
      fetch.mock.calls.filter(([path]) => path === "/api/auth/register"),
    ).toHaveLength(1);
    await act(async () => {
      registration.resolve(Response.json(authSession(), { status: 201 }));
    });
    await screen.findByText("anna@example.test");
    expect(localStorage.length).toBe(0);
  });

  it("keeps the authenticated journal after a logout network failure and clears its cache after a successful logout", async () => {
    let currentUser = 1;
    let logoutFailed = true;
    let lists = 0;
    const fetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/session") return Response.json(authSession());
      if (path === "/api/auth/logout") {
        expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
          "test-csrf-1",
        );
        if (logoutFailed) throw new TypeError("Failed to fetch");
        return new Response(null, { status: 204 });
      }
      if (path === "/api/auth/login") {
        currentUser = 2;
        return Response.json(authSession(2));
      }
      if (path === "/api/experiments") lists++;
      return journalResponse(
        path,
        currentUser === 1 ? "Данные первого сеанса" : "Данные второго сеанса",
      );
    });
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    await screen.findByRole("link", { name: "Данные первого сеанса" });
    fireEvent.click(
      screen.getByRole("button", { name: "Выйти из учётной записи" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Проверьте подключение",
    );
    expect(
      screen.getByRole("link", { name: "Данные первого сеанса" }),
    ).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Вход в журнал" })).toBeNull();
    logoutFailed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Выйти из учётной записи" }),
    );
    await screen.findByRole("form", { name: "Вход в журнал" });
    expect(screen.queryByText("Данные первого сеанса")).toBeNull();
    expect(captureSession().csrfToken).toBeNull();
    fillLogin();
    fireEvent.click(screen.getByRole("button", { name: "Войти в журнал" }));
    await screen.findByRole("link", { name: "Данные второго сеанса" });
    expect(screen.getByText("mikhail@example.test")).toBeTruthy();
    expect(screen.queryByText("Данные первого сеанса")).toBeNull();
    expect(lists).toBe(2);
  });

  it("expires the session on a protected 401 and removes previously rendered journal data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/auth/session") return Response.json(authSession());
        if (path === "/api/expired") return unauthorized();
        return journalResponse(path);
      }),
    );
    render(<App />);
    await screen.findByRole("link", { name: "Исследование группы" });
    await act(async () => {
      await request("/expired").catch(() => undefined);
    });
    await screen.findByRole("form", { name: "Вход в журнал" });
    expect(
      screen.queryByRole("link", { name: "Исследование группы" }),
    ).toBeNull();
    expect(captureSession().csrfToken).toBeNull();
  });

  it("does not offer a new login while logout is pending, even if a protected request gets 401", async () => {
    const signOut = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/auth/session") return Response.json(authSession());
        if (path === "/api/auth/logout") return signOut.promise;
        if (path === "/api/expired") return unauthorized();
        return journalResponse(path);
      }),
    );
    render(<App />);
    await screen.findByRole("link", { name: "Исследование группы" });
    fireEvent.click(
      screen.getByRole("button", { name: "Выйти из учётной записи" }),
    );
    await act(async () => {
      await request("/expired").catch(() => undefined);
    });
    expect(screen.getByText("Завершаем сеанс…")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Вход в журнал" })).toBeNull();
    await act(async () => {
      signOut.resolve(new Response(null, { status: 204 }));
    });
    await screen.findByRole("form", { name: "Вход в журнал" });
  });

  it("offers retry after bootstrap failure instead of silently treating a network error as logout", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/auth/session") {
          if (++attempts === 1) throw new TypeError("offline");
          return Response.json(authSession());
        }
        return journalResponse(path);
      }),
    );
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Проверьте подключение",
    );
    expect(screen.queryByRole("form", { name: "Вход в журнал" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Повторить подключение" }),
    );
    await screen.findByText("anna@example.test");
    expect(attempts).toBe(2);
  });

  it("rechecks a shared browser cookie on focus and replaces journal data when another tab changed accounts", async () => {
    let user = 1;
    let lists = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/auth/session")
          return Response.json(authSession(user));
        if (path === "/api/experiments") lists++;
        return journalResponse(
          path,
          user === 1 ? "Первый сеанс" : "Обновлённый сеанс",
        );
      }),
    );
    render(<App />);
    await screen.findByRole("link", { name: "Первый сеанс" });
    user = 2;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await screen.findByText("mikhail@example.test");
    await screen.findByRole("link", { name: "Обновлённый сеанс" });
    expect(screen.queryByText("Первый сеанс")).toBeNull();
    await waitFor(() => expect(lists).toBe(2));
  });
});
