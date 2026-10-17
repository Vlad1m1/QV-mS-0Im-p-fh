export interface Author {
  id: number;
  name: string;
}
export interface Parameter {
  name: string;
  value: string;
  unit: string;
}
export interface AttemptValues {
  parameters: Parameter[];
  result_name: string;
  result_value: string;
  result_unit: string;
  note: string;
}
export interface Version extends AttemptValues {
  id: number;
  version: number;
  author: string;
  author_id: number;
  created_at: string;
  reason: string;
}
export interface Attempt {
  id: number;
  number: number;
  author: string;
  author_id: number;
  created_at: string;
  current: Version;
  versions: Version[];
}
export interface ExperimentValues {
  title: string;
  objective: string;
  date: string;
}
export interface StoredExperiment extends ExperimentValues {
  id: number;
  number: number;
  work_mode: WorkMode;
  author_id: number;
  version: number;
  created_at: string;
}
export interface ExperimentRecord extends StoredExperiment {
  author: string;
  participants: Author[];
}
export interface ExperimentSummary extends ExperimentRecord {
  attempt_count: number;
  event_count: number;
}
interface EventBase {
  id: number;
  author: string;
  author_id: number;
  created_at: string;
  content: string;
}
export type JournalEvent = EventBase &
  (
    | {
        kind: "experiment_created" | "experiment_edited";
        before: ExperimentValues | null;
        after: ExperimentValues;
      }
    | {
        kind: "attempt_created" | "attempt_edited";
        before: AttemptValues | null;
        after: AttemptValues;
      }
    | { kind: "observation"; before: null; after: null }
  );
export interface ExperimentDetail extends ExperimentRecord {
  attempts: Attempt[];
  history: JournalEvent[];
}
export interface ExperimentFilters {
  search: string;
  parameter: string;
  author: string;
  dateFrom: string;
  dateTo: string;
}
export const emptyFilters: ExperimentFilters = {
  search: "",
  parameter: "",
  author: "",
  dateFrom: "",
  dateTo: "",
};
export type WorkMode = "solo" | "shared";
export interface ExperimentInput extends ExperimentValues {
  work_mode: WorkMode;
  collaborator_emails: string[];
}
export type AttemptInput = AttemptValues;
export interface Correction {
  expected_version: number;
  reason: string;
}
export type ExportFormat = "csv" | "json";
