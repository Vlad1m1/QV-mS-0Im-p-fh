import type {
  AttemptValues,
  ExperimentValues,
  JournalEvent,
} from "@/domain/models.ts";
import { day, number } from "@/shared/format.ts";

type Fields = Map<string, string>;
function attemptFields(snapshot: AttemptValues): Fields {
  const fields: Fields = new Map();
  for (const parameter of snapshot.parameters) {
    fields.set(
      `Параметр: ${parameter.name}`,
      `${number(parameter.value)} ${parameter.unit}`,
    );
  }
  fields.set(
    "Результат",
    `${snapshot.result_name}: ${number(snapshot.result_value)} ${snapshot.result_unit}`,
  );
  fields.set("Примечание", snapshot.note || "—");
  return fields;
}
function experimentFields(snapshot: ExperimentValues): Fields {
  return new Map([
    ["Название", snapshot.title],
    ["Цель", snapshot.objective],
    ["Дата", day(snapshot.date)],
  ]);
}
export interface FieldChange {
  field: string;
  before?: string;
  after?: string;
}
export function eventChanges(event: JournalEvent): FieldChange[] {
  if (event.kind === "observation") return [];
  let before: Fields;
  let after: Fields;
  if (event.kind === "attempt_created" || event.kind === "attempt_edited") {
    before = event.before ? attemptFields(event.before) : new Map();
    after = attemptFields(event.after);
  } else if (
    event.kind === "experiment_created" ||
    event.kind === "experiment_edited"
  ) {
    before = event.before ? experimentFields(event.before) : new Map();
    after = experimentFields(event.after);
  } else return [];
  return Array.from(new Set([...before.keys(), ...after.keys()]))
    .map((field) => ({
      field,
      before: before.get(field),
      after: after.get(field),
    }))
    .filter(
      (change) =>
        !event.kind.endsWith("_edited") || change.before !== change.after,
    );
}
