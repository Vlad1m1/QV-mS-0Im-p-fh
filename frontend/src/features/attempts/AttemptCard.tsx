import { ChevronDown, History, MessageSquare, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Attempt, Version } from "../../domain/models";
import { countLabel, number, time } from "../../shared/format";

export function MeasurementTable({ version }: { version: Version }) {
  return (
    <Table
      className="measurement-table"
      containerProps={{
        role: "region",
        tabIndex: 0,
        "aria-label": `Параметры измерений · версия ${version.version}`,
      }}
    >
      <TableHeader>
        <TableRow>
          <TableHead className="measurement-table__parameter-heading">
            Параметр
          </TableHead>
          <TableHead className="measurement-table__heading">Значение</TableHead>
          <TableHead className="measurement-table__heading">Единица</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {version.parameters.map((parameter, index) => (
          <TableRow key={index}>
            <TableCell className="measurement-table__parameter">
              {parameter.name}
            </TableCell>
            <TableCell className="measurement-table__value">
              {number(parameter.value)}
            </TableCell>
            <TableCell className="measurement-table__unit">
              {parameter.unit}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AttemptCard({
  attempt,
  edit,
}: {
  attempt: Attempt;
  edit: () => void;
}) {
  const current = attempt.current;
  return (
    <Card className="attempt-card">
      <CardHeader className="attempt-card__header">
        <div className="attempt-card__identity">
          <Badge variant="secondary" className="attempt-card__number">
            {String(attempt.number).padStart(2, "0")}
          </Badge>
          <div className="attempt-card__name">
            <h3 className="attempt-card__title">Попытка {attempt.number}</h3>
            <p className="attempt-card__byline">
              {attempt.author} ·{" "}
              <time dateTime={attempt.created_at}>
                {time(attempt.created_at)} МСК
              </time>
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={edit}>
          <Pencil /> Исправить
        </Button>
      </CardHeader>
      <CardContent className="attempt-card__content">
        <MeasurementTable version={current} />
        <div className="attempt-card__result">
          <p className="attempt-card__result-name">{current.result_name}</p>
          <p className="attempt-card__result-value">
            {number(current.result_value)}{" "}
            <span className="attempt-card__result-unit">
              {current.result_unit}
            </span>
          </p>
        </div>
        {current.note && (
          <div className="attempt-card__note">
            <MessageSquare className="attempt-card__note-icon" />
            <p className="attempt-card__note-content">{current.note}</p>
          </div>
        )}
        {current.version > 1 && (
          <Collapsible className="attempt-versions">
            <Separator />
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="attempt-versions__trigger">
                <History className="attempt-versions__icon" />
                <span className="attempt-versions__summary">
                  {countLabel(current.version, "версия", "версии", "версий")} ·
                  исправлено {current.author}
                </span>
                <ChevronDown className="attempt-versions__icon" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="attempt-versions">
              {attempt.versions.map((version) => (
                <section className="attempt-version" key={version.id}>
                  <div className="attempt-version__header">
                    <h4 className="attempt-version__title">
                      Версия {version.version}
                      {version.version === current.version
                        ? " · текущая"
                        : " · предыдущая"}
                    </h4>
                    <p className="attempt-version__byline">
                      {version.author} ·{" "}
                      <time dateTime={version.created_at}>
                        {time(version.created_at)} МСК
                      </time>
                    </p>
                  </div>
                  <MeasurementTable version={version} />
                  <p className="attempt-version__result">
                    {version.result_name}:{" "}
                    <strong className="attempt-version__result-value">
                      {number(version.result_value)} {version.result_unit}
                    </strong>
                  </p>
                  {version.note && (
                    <p className="attempt-version__note">{version.note}</p>
                  )}
                  {version.reason && (
                    <p className="attempt-version__reason">
                      <span className="attempt-version__reason-label">
                        Причина исправления:{" "}
                      </span>
                      {version.reason}
                    </p>
                  )}
                </section>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
