import type { AuthSession } from "../auth/models";

export function authSession(id = 1): AuthSession {
  return {
    user: {
      id,
      author_id: id,
      name: id === 1 ? "Анна Петрова" : "Михаил Соколов",
      email: id === 1 ? "anna@example.test" : "mikhail@example.test",
    },
    csrf_token: `test-csrf-${id}`,
    expires_at: "2030-01-01T00:00:00+00:00",
  };
}
