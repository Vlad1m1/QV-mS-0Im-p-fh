import { useEffect, useSyncExternalStore } from "react";
import type { QueryResource } from "./queryStore";

export function useQuery<T>(resource: QueryResource<T>) {
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot);
  useEffect(() => resource.activate(), [resource]);
  return state;
}
