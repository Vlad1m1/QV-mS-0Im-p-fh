import type { Attempt, ExperimentDetail, Version } from "../domain/models";

export function version(overrides: Partial<Version> = {}): Version {
  return {
    id: 101,
    version: 1,
    parameters: [{ name: "Температура", value: "20", unit: "°C" }],
    result_name: "Растворимость",
    result_value: "31.0",
    result_unit: "g/100 g воды",
    note: "Исходная запись",
    author: "Анна Петрова",
    author_id: 1,
    created_at: "2026-10-16T07:00:00Z",
    reason: "",
    ...overrides,
  };
}
export function attempt(id = 11, overrides: Partial<Version> = {}): Attempt {
  const current = version(overrides);
  return {
    id,
    number: id - 10,
    author: current.author,
    author_id: current.author_id,
    created_at: current.created_at,
    current,
    versions: [current],
  };
}
export function experiment(): ExperimentDetail {
  return {
    id: 1,
    number: 1,
    work_mode: "solo",
    title: "Растворимость",
    objective: "Учебные данные",
    date: "2026-10-16",
    author_id: 1,
    author: "Анна Петрова",
    version: 1,
    created_at: "2026-10-16T06:00:00Z",
    participants: [{ id: 1, name: "Анна Петрова" }],
    attempts: [attempt(), attempt(12, { result_value: "40" })],
    history: [],
  };
}
