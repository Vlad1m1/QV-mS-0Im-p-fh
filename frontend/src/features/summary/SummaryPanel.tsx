import { useId, useMemo, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExperimentDetail } from "../../domain/models";
import { time } from "../../shared/format";
import {
  chartPoints,
  descriptiveRows,
  measurementRows,
  parameterIndicators,
  resultIndicators,
} from "./summary";
import { SummaryChart } from "./SummaryChart";

export function SummaryPanel({ experiment }: { experiment: ExperimentDetail }) {
  const selectId = useId();
  const [parameterKey, setParameterKey] = useState("");
  const [resultKey, setResultKey] = useState("");
 const rows = useMemo(() => measurementRows(experiment), [experiment]);
  const rowSpans = useMemo(() => {
    const counts = new Map<number, number>();
    rows.forEach((row) =>
      counts.set(row.attemptId, (counts.get(row.attemptId) ?? 0) + 1),
    );
    return counts;
  }, [rows]);
  const statistics = useMemo(
    () => descriptiveRows(experiment.attempts),
    [experiment.attempts],
  );
  const parameters = useMemo(
    () => parameterIndicators(experiment.attempts),
    [experiment.attempts],
  );
  const results = useMemo(
    () => resultIndicators(experiment.attempts),
    [experiment.attempts],
  );
  const parameter =
    parameters.find((item) => item.key === parameterKey) ?? parameters[0];
  const result = results.find((item) => item.key === resultKey) ?? results[0];
  const chart = useMemo(
    () =>
      parameter && result
        ? chartPoints(experiment.attempts, parameter, result)
        : { points: [], skipped: 0 },
    [experiment.attempts, parameter, result],
  );

  if (!experiment.attempts.length)
    return (
      <Empty className="journal-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartNoAxesCombined />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={3}>
            Пока нет измерений
          </EmptyTitle>
          <EmptyDescription>
            Добавьте попытку на вкладке «Попытки», чтобы увидеть сводку.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <section className="summary-panel" aria-label="Сводка эксперимента">
      <div className="summary-panel__toolbar">
        <div className="summary-panel__heading">
          <h2>Измерения</h2>
        </div>
      </div>
      <div className="summary-panel__table-frame">
        <Table
          className="summary-measurements"
          containerProps={{
            role: "region",
            tabIndex: 0,
            "aria-label": "Измерения текущих версий попыток",
          }}
        >
          <TableHeader>
            <TableRow>
              <TableHead>Попытка</TableHead>
              <TableHead>Показатель</TableHead>
              <TableHead>Значение</TableHead>
              <TableHead>Единица</TableHead>
              <TableHead>Примечание</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const firstRow = rows[index - 1]?.attemptId !== row.attemptId;
              const rowSpan = rowSpans.get(row.attemptId);
              return (
                <TableRow
                  key={`${row.attemptId}-${row.kind}-${row.name}-${index}`}
                  className={
                    row.kind === "result"
                      ? "summary-measurements__result"
                      : undefined
                  }
                >
                  {firstRow && (
                    <TableCell
                      rowSpan={rowSpan}
                      className="summary-measurements__attempt"
                    >
                      <strong>Попытка {row.attemptNumber}</strong>
                      <small>
                        Версия {row.version} · {row.author}
                      </small>
                      <time dateTime={row.createdAt}>
                        {time(row.createdAt)} МСК
                      </time>
                    </TableCell>
                  )}
                  <TableCell>
                    <span>{row.name}</span>
                    {row.kind === "result" && <small>Результат</small>}
                  </TableCell>
                  <TableCell className="summary-panel__numeric">
                    {row.value}
                  </TableCell>
                  <TableCell>{row.unit}</TableCell>
                  {firstRow && (
                    <TableCell
                      rowSpan={rowSpan}
                      className="summary-measurements__note"
                    >
                      {row.note || "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {parameter && result && (
        <Card className="summary-panel__chart-card">
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>
              График измерений
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="summary-panel__selectors">
              <div className="summary-panel__selector">
                <NativeSelect
                  id={`${selectId}-parameter`}
                  value={parameter.key}
                  onChange={(event) => setParameterKey(event.target.value)}
                >
                  {parameters.map((item) => (
                    <NativeSelectOption key={item.key} value={item.key}>
                      {item.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="summary-panel__selector">
                <NativeSelect
                  id={`${selectId}-result`}
                  value={result.key}
                  onChange={(event) => setResultKey(event.target.value)}
                >
                  {results.map((item) => (
                    <NativeSelectOption key={item.key} value={item.key}>
                      {item.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <SummaryChart
              parameter={parameter}
              result={result}
              points={chart.points}
            />
            {chart.skipped > 0 && (
              <p className="summary-panel__caption">
                Не показано попыток: {chart.skipped}. Нет выбранной пары
                показателей или значение выходит за диапазон графика.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="summary-panel__statistics">
        <h3>Статистика результатов</h3>
        <div className="summary-panel__table-frame">
          <Table
            className="summary-statistics"
            containerProps={{
              role: "region",
              tabIndex: 0,
              "aria-label": "Статистика результатов по показателям и единицам",
            }}
          >
            <TableHeader>
              <TableRow>
                <TableHead>Показатель</TableHead>
                <TableHead>Единица</TableHead>
                <TableHead>Количество</TableHead>
                <TableHead>Минимум</TableHead>
                <TableHead>Максимум</TableHead>
                <TableHead>Среднее</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statistics.map((row) => (
                <TableRow key={row.indicator.key}>
                  <TableCell>{row.indicator.name}</TableCell>
                  <TableCell>{row.indicator.unit}</TableCell>
                  <TableCell className="summary-panel__numeric">
                    {row.count}
                  </TableCell>
                  <TableCell className="summary-panel__numeric">
                    {row.min}
                  </TableCell>
                  <TableCell className="summary-panel__numeric">
                    {row.max}
                  </TableCell>
                  <TableCell className="summary-panel__numeric">
                    {row.mean}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
