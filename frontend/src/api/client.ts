import type {
  Attempt,
  AttemptInput,
  Author,
  Correction,
  ExperimentDetail,
  ExperimentFilters,
  ExperimentInput,
  ExperimentSummary,
  ExperimentValues,
  ExportFormat,
  StoredExperiment,
} from "../domain/models";
import { captureSession, expireSession } from "./sessionTransport";

const fallbackError =
  "Не удалось выполнить запрос. Проверьте подключение к серверу.";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof TypeError) return fallbackError;
  return error instanceof Error ? error.message : fallbackError;
}
function responseMessage(body: unknown): string {
  if (!body || typeof body !== "object" || !("detail" in body))
    return fallbackError;
  if (typeof body.detail === "string") return body.detail;
  if (!Array.isArray(body.detail)) return fallbackError;
  const messages = body.detail.flatMap((item: unknown) =>
    item &&
    typeof item === "object" &&
    "msg" in item &&
    typeof item.msg === "string"
      ? [item.msg.replace(/^Value error, /, "")]
      : [],
  );
  return messages.join(". ") || fallbackError;
}
async function response(
  path: string,
  init?: RequestInit,
  authenticated = true,
): Promise<Response> {
  const session = captureSession();
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const method = (init?.method ?? "GET").toUpperCase();
  if (
    authenticated &&
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    session.csrfToken
  )
    headers.set("X-CSRF-Token", session.csrfToken);
  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!res.ok) {
    if (authenticated && res.status === 401) expireSession(session.generation);
    throw new ApiError(
      responseMessage(await res.json().catch(() => null)),
      res.status,
    );
  }
  return res;
}
export async function request<T>(
  path: string,
  init?: RequestInit,
  authenticated = true,
): Promise<T> {
  return (await response(path, init, authenticated)).json();
}
export async function requestEmpty(
  path: string,
  init?: RequestInit,
): Promise<void> {
  await response(path, init);
}
export function experimentPath(filters?: ExperimentFilters): string {
  const query = new URLSearchParams();
  if (filters) {
    if (filters.search) query.set("q", filters.search);
    if (filters.parameter) query.set("parameter", filters.parameter);
    if (filters.author) query.set("author_id", filters.author);
    if (filters.dateFrom) query.set("date_from", filters.dateFrom);
    if (filters.dateTo) query.set("date_to", filters.dateTo);
  }
  return `/experiments${query.size ? `?${query}` : ""}`;
}
const mutation = <T>(path: string, body: object, method = "POST") =>
  request<T>(path, { method, body: JSON.stringify(body) });

export const journalApi = {
  authors: (signal: AbortSignal) => request<Author[]>("/authors", { signal }),
  experiments: (path: string, signal: AbortSignal) =>
    request<ExperimentSummary[]>(path, { signal }),
  experiment: (id: number, signal: AbortSignal) =>
    request<ExperimentDetail>(`/experiments/${id}`, { signal }),
  createExperiment: (payload: ExperimentInput) =>
    mutation<StoredExperiment>("/experiments", payload),
  editExperiment: (id: number, payload: ExperimentValues & Correction) =>
    mutation<StoredExperiment>(`/experiments/${id}`, payload, "PUT"),
  createAttempt: (id: number, payload: AttemptInput) =>
    mutation<Attempt>(`/experiments/${id}/attempts`, payload),
  editAttempt: (id: number, payload: AttemptInput & Correction) =>
    mutation<Attempt>(`/attempts/${id}`, payload, "PUT"),
  addObservation: (id: number, content: string) =>
    mutation<unknown>(`/experiments/${id}/observations`, {
      content,
    }),
  export: async (id: number, format: ExportFormat) =>
    (await response(`/experiments/${id}/export?format=${format}`)).blob(),
};
