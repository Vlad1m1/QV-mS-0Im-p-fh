import { CircleAlert, Plus, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useJournal } from "../../app/JournalProvider";
import { experimentPath } from "../../api/client";
import { useQuery } from "../../api/useQuery";
import { useDebouncedValue } from "../../shared/useDebouncedValue";
import { ExperimentCard } from "./ExperimentCard";
import { SearchFilters } from "./SearchFilters";

export function ExperimentList() {
  const { filters, resetFilters, openModal, navigate, store } = useJournal();
  const filtered = Object.values(filters).some(Boolean);
  const path = useDebouncedValue(experimentPath(filters));
  const query = useQuery(store.list(path));
  const allItems = useQuery(store.list()).data ?? [];
  const items = query.data ?? [];
  const loading = query.pending || query.data === undefined;
  const createExperiment = () => openModal({ kind: "experiment" });
  return (
    <div className="journal-list">
      <div className="journal-heading">
        <h1 id="experiments-title">
          Эксперименты
          <Badge variant="secondary" className="journal-count">
            {filtered ? items.length : allItems.length}
          </Badge>
        </h1>
        <Button onClick={createExperiment} className="journal-heading__create">
          <Plus />
          Новый эксперимент
        </Button>
      </div>
      <section
        className="journal-experiments"
        aria-labelledby="experiments-title"
      >
        <SearchFilters />
        {query.error ? (
          <Alert>
            <CircleAlert />
            <AlertTitle>Не удалось загрузить журнал</AlertTitle>
            <AlertDescription className="journal-error">
              <p>{query.error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void store.list(path).refresh()}
              >
                Повторить
              </Button>
            </AlertDescription>
          </Alert>
        ) : loading && items.length === 0 ? (
          <div
            className="experiment-grid"
            role="status"
            aria-label="Загружаем журнал"
          >
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="journal-loading-card" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty className="journal-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle role="heading" aria-level={3}>
                {filtered
                  ? "Эксперименты не найдены"
                  : "Начните с первого эксперимента"}
              </EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "Попробуйте другой запрос или сбросьте фильтры."
                  : "Создайте личное исследование или выберите участников для совместной работы."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant={filtered ? "outline" : "default"}
                onClick={filtered ? resetFilters : createExperiment}
              >
                {filtered ? "Сбросить фильтры" : "Создать эксперимент"}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="experiment-grid">
            {items.map((experiment) => (
              <ExperimentCard
                key={experiment.id}
                experiment={experiment}
                onOpen={() => navigate(experiment.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
