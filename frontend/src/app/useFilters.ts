import { useCallback, useState } from "react";
import { emptyFilters } from "../domain/models";
import type { ExperimentFilters } from "../domain/models";

export function useFilters() {
  const [filters, setFilters] = useState<ExperimentFilters>(emptyFilters);
  const updateFilter = useCallback(
    (field: keyof ExperimentFilters, value: string) => {
      setFilters((current) => ({ ...current, [field]: value }));
    },
    [],
  );
  const resetFilters = useCallback(() => setFilters(emptyFilters), []);
  return { filters, updateFilter, resetFilters };
}
