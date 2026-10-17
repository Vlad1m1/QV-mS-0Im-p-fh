import { useEffect, useState } from "react";
import { FlaskConical, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import type { ExperimentDetail } from "../../domain/models";
import { useJournal } from "../../app/JournalProvider";
import { UserAvatar } from "../../shared/identity";
import { time } from "../../shared/format";
import { AttemptCard } from "./AttemptCard";

// Keep the first, selected and last pages available without growing the toolbar.
function visiblePages(
  current: number,
  count: number,
): (number | "start-gap" | "end-gap")[] {
  if (count <= 5) return Array.from({ length: count }, (_, index) => index);
  if (current < 2) return [0, 1, 2, "end-gap", count - 1];
  if (current > count - 3)
    return [0, "start-gap", count - 3, count - 2, count - 1];
  return [0, "start-gap", current, "end-gap", count - 1];
}

export function AttemptsPanel({
  experiment,
}: {
  experiment: ExperimentDetail;
}) {
  const { openModal } = useJournal();
  const [selectedId, selectAttempt] = useState(experiment.attempts[0]?.id);
  useEffect(() => {
    selectAttempt(experiment.attempts[0]?.id);
  }, [experiment.id]);
  const index = Math.max(
    0,
    experiment.attempts.findIndex((attempt) => attempt.id === selectedId),
  );
  const selectedAttempt = experiment.attempts[index];
  const selectPage = (page: number) => {
    const attempt = experiment.attempts[page];
    if (attempt) selectAttempt(attempt.id);
  };
  const observations = experiment.history
    .filter((event) => event.kind === "observation")
    .reverse();
  const addObservation = () => openModal({ kind: "observation", experiment });

  return (
    <div className="attempts-layout">
      <section className="attempts-panel" aria-label="Попытки эксперимента">
        <div className="attempts-panel__heading">
          {experiment.attempts.length > 0 && (
            <Pagination aria-label="Навигация по попыткам">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    disabled={index === 0}
                    onClick={() => selectPage(index - 1)}
                  />
                </PaginationItem>
                {visiblePages(index, experiment.attempts.length).map((page) => (
                  <PaginationItem key={page}>
                    {typeof page === "number" ? (
                      <PaginationLink
                        isActive={page === index}
                        aria-label={`Попытка ${experiment.attempts[page].number}`}
                        onClick={() => selectPage(page)}
                      >
                        {experiment.attempts[page].number}
                      </PaginationLink>
                    ) : (
                      <PaginationEllipsis />
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    disabled={index === experiment.attempts.length - 1}
                    onClick={() => selectPage(index + 1)}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
          <Button
            className="attempts-panel__add"
            onClick={() => openModal({ kind: "attempt", experiment })}
          >
            <Plus /> Добавить попытку
          </Button>
        </div>
        {!experiment.attempts.length && (
          <Empty className="attempts-panel__empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FlaskConical />
              </EmptyMedia>
              <EmptyTitle>Пока нет попыток</EmptyTitle>
              <EmptyDescription>
                Внесите параметры и результат первого измерения.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {selectedAttempt && (
          <AttemptCard
            key={selectedAttempt.id}
            attempt={selectedAttempt}
            edit={() =>
              openModal({ kind: "attempt", experiment, edit: selectedAttempt })
            }
          />
        )}
      </section>
      <aside className="attempts-aside">
        <Card className="observations-card">
          <CardHeader className="observations-card__header">
            <div className="observations-card__heading">
              <CardTitle className="observations-card__title">
                <MessageSquare className="observations-card__icon" /> Наблюдения
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={addObservation}
                aria-label="Добавить наблюдение"
              >
                <Plus />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="observations-card__content">
            {observations.length === 0 && (
              <p className="observations-card__empty">Наблюдений пока нет.</p>
            )}
            {observations.map((event, index) => (
              <div key={event.id} className="observation-entry">
                {index > 0 && <Separator />}
                <div className="observation-entry__author">
                  <UserAvatar
                    name={event.author}
                    className="observation-entry__avatar"
                  />
                  <strong className="observation-entry__author-name">
                    {event.author}
                  </strong>
                </div>
                <p className="observation-entry__content">{event.content}</p>
                <time
                  dateTime={event.created_at}
                  className="observation-entry__date"
                >
                  {time(event.created_at)} МСК
                </time>
              </div>
            ))}
            <Button
              variant="outline"
              className="observations-card__add"
              onClick={addObservation}
            >
              <Plus /> Добавить наблюдение
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
