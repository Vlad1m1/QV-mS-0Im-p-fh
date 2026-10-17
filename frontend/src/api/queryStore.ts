import { errorMessage } from "./client";

export interface QueryState<T> {
  data: T | undefined;
  pending: boolean;
  error: string;
}
/** A resource owns its requests. A superseded or inactive request cannot publish. */
export class QueryResource<T> {
  private state: QueryState<T> = { data: undefined, pending: false, error: "" };
  private readonly listeners = new Set<() => void>();
  private controller?: AbortController;
  private revision = 0;
  private consumers = 0;
  constructor(private readonly loader: (signal: AbortSignal) => Promise<T>) {}
  readonly getSnapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: QueryState<T>) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  activate(): () => void {
    this.consumers++;
    if (this.consumers === 1) void this.refresh();
    return () => {
      this.consumers--;
      if (!this.consumers) this.cancel();
    };
  }
  get active() {
    return this.consumers > 0;
  }
  cancel() {
    this.revision++;
    this.controller?.abort();
    this.controller = undefined;
    if (this.state.pending) this.publish({ ...this.state, pending: false });
  }
  async refresh(): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const revision = ++this.revision;
    this.publish({ ...this.state, pending: true, error: "" });
    try {
      const data = await this.loader(controller.signal);
      if (revision === this.revision && !controller.signal.aborted) {
        this.publish({ data, pending: false, error: "" });
      }
    } catch (error) {
      if (revision === this.revision && !controller.signal.aborted) {
        this.publish({
          ...this.state,
          pending: false,
          error: errorMessage(error),
        });
      }
    }
  }
}
