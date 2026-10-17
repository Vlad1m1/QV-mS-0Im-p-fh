import {
  ChevronDown,
  History,
  MessageSquare,
  Pencil,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExperimentDetail } from "@/domain/models.ts";
import { UserAvatar } from "@/shared/identity";
import { time } from "@/shared/format";
import { eventChanges } from "./changes";

export function HistoryPanel({ experiment }: { experiment: ExperimentDetail }) {
  return (
    <section className="history-panel" aria-label="История эксперимента">
      {experiment.history.length === 0 ? (
        <Empty className="journal-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle role="heading" aria-level={3}>
              История пока пуста
            </EmptyTitle>
            <EmptyDescription>
              Здесь появятся записи и сохранённые исправления эксперимента.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="history-panel__events">
          {experiment.history.map((event) => {
            const isEdit = event.kind.endsWith("_edited");
            const changes = eventChanges(event);
            const Icon = isEdit
              ? Pencil
              : event.kind === "observation"
                ? MessageSquare
                : Plus;
            return (
              <Card key={event.id} className="history-event">
                <CardContent className="history-event__body">
                  <div className="history-event__header">
                    <div className="history-event__identity">
                      <UserAvatar
                        name={event.author}
                        className="history-event__avatar"
                      />
                      <div className="history-event__author">
                        <span>{event.author}</span>
                        <Badge
                          variant={isEdit ? "default" : "secondary"}
                          className="history-event__label"
                        >
                          <Icon />
                          {isEdit
                            ? "Исправление"
                            : event.kind === "observation"
                              ? "Наблюдение"
                              : "Новая запись"}
                        </Badge>
                      </div>
                    </div>
                    <time dateTime={event.created_at}>
                      {time(event.created_at)} МСК
                    </time>
                  </div>
                  <p className="history-event__content">{event.content}</p>
                  {changes.length > 0 && (
                    <Collapsible
                      defaultOpen={isEdit}
                      className="history-event__details"
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="history-event__trigger"
                        >
                          {isEdit ? "Что изменилось" : "Показать запись"}
                          <ChevronDown />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="history-event__details-content">
                        <div className="history-event__table-frame">
                          <Table
                            containerProps={{
                              role: "region",
                              tabIndex: 0,
                              "aria-label": isEdit
                                ? "Исходные и исправленные значения"
                                : "Сохранённые значения записи",
                            }}
                            className={
                              isEdit
                                ? "history-diff history-diff--edit"
                                : "history-diff"
                            }
                          >
                            <TableHeader>
                              <TableRow>
                                <TableHead>Поле</TableHead>
                                {isEdit && <TableHead>Было</TableHead>}
                                <TableHead>
                                  {isEdit ? "Стало" : "Сохранённое значение"}
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {changes.map(({ field, before, after }) => (
                                <TableRow key={field}>
                                  <TableCell className="history-diff__field">
                                    {field}
                                  </TableCell>
                                  {isEdit && (
                                    <TableCell className="history-diff__before">
                                      {before || "—"}
                                    </TableCell>
                                  )}
                                  <TableCell>{after || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
