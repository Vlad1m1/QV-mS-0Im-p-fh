import type { ExperimentDetail, ExperimentSummary } from "../domain/models";
import { journalApi } from "./client";
import { QueryResource } from "./queryStore";

export class JournalStore {
  readonly authors = new QueryResource(journalApi.authors);
  private readonly lists = new Map<
    string,
    QueryResource<ExperimentSummary[]>
  >();
  private readonly details = new Map<number, QueryResource<ExperimentDetail>>();
  list(path = "/experiments") {
    let resource = this.lists.get(path);
    if (!resource) {
      resource = new QueryResource((signal) =>
        journalApi.experiments(path, signal),
      );
      this.lists.set(path, resource);
      // Search keys are transient; only active and recent lists need caching.
      if (this.lists.size > 30) {
        for (const [key, candidate] of this.lists) {
          if (key !== path && !candidate.active) this.lists.delete(key);
          if (this.lists.size <= 20) break;
        }
      }
    }
    return resource;
  }
  detail(id: number) {
    let resource = this.details.get(id);
    if (!resource) {
      resource = new QueryResource((signal) =>
        journalApi.experiment(id, signal),
      );
      this.details.set(id, resource);
    }
    return resource;
  }
  refresh() {
    for (const resource of [
      this.authors,
      ...this.lists.values(),
      ...this.details.values(),
    ]) {
      if (resource.active) void resource.refresh();
    }
  }
}
