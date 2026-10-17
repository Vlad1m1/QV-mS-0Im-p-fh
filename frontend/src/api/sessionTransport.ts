/** Session credentials live only in memory; the session itself is an HttpOnly cookie. */
let generation = 0;
let csrfToken: string | null = null;
const expirationListeners = new Set<() => void>();

export function replaceSessionToken(token: string | null): number {
  csrfToken = token;
  return ++generation;
}

export function captureSession() {
  return { generation, csrfToken };
}

export function subscribeToExpiration(listener: () => void) {
  expirationListeners.add(listener);
  return () => {
    expirationListeners.delete(listener);
  };
}

export function expireSession(requestGeneration: number) {
  // A response from an earlier login must never invalidate a newer session.
  if (requestGeneration !== generation || csrfToken === null) return;
  replaceSessionToken(null);
  expirationListeners.forEach((listener) => listener());
}
