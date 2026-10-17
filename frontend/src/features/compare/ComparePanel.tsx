import { useState } from "react";
import { GitCompareArrows } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
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
import type { Attempt } from "../../domain/models";
import { number, time } from "../../shared/format";
import { comparisonPair, comparisonRows } from "./comparison";

export function ComparePanel({ attempts }: { attempts: Attempt[] }) {
  const [leftId, setLeftId] = useState(attempts[0]?.id || 0);
  const [rightId, setRightId] = useState(attempts[1]?.id || 0);
  const pair = comparisonPair(attempts, leftId, rightId);
  if (!pair)
    return (
      <Empty className="journal-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitCompareArrows />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={3}>
            Нужны две попытки
          </EmptyTitle>
          <EmptyDescription>
            Добавьте ещё одну попытку на вкладке «Попытки» для сравнения.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const [left, right] = pair;
  const rows = comparisonRows(left, right);
  return (
    <section className="comparison-panel" aria-label="Сравнение попыток">
      <div className="comparison-panel__selectors">
        <div className="comparison-panel__selector">
          <Label htmlFor="compare-left">Первая попытка</Label>
          <NativeSelect
            id="compare-left"
            aria-label="Первая попытка для сравнения"
            value={left.id}
            onChange={(event) => setLeftId(Number(event.target.value))}
          >
            {attempts
              .filter((attempt) => attempt.id !== right.id)
              .map((attempt) => (
                <NativeSelectOption key={attempt.id} value={attempt.id}>
                  Попытка {attempt.number} · {attempt.author}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </div>
        <GitCompareArrows
          className="comparison-panel__swap"
          aria-hidden="true"
        />
        <div className="comparison-panel__selector">
          <Label htmlFor="compare-right">Вторая попытка</Label>
          <NativeSelect
            id="compare-right"
            aria-label="Вторая попытка для сравнения"
            value={right.id}
            onChange={(event) => setRightId(Number(event.target.value))}
          >
            {attempts
              .filter((attempt) => attempt.id !== left.id)
              .map((attempt) => (
                <NativeSelectOption key={attempt.id} value={attempt.id}>
                  Попытка {attempt.number} · {attempt.author}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </div>
      </div>
      <div className="comparison-panel__table-frame">
        <Table
          className="comparison-table"
          containerProps={{
            role: "region",
            tabIndex: 0,
            "aria-label": `Сравнение попыток ${left.number} и ${right.number}`,
          }}
        >
          <TableHeader>
            <TableRow>
              <TableHead>Показатель</TableHead>
              <TableHead>
                <span>Попытка {left.number}</span>
                <small>Версия {left.current.version}</small>
              </TableHead>
              <TableHead>
                <span>Попытка {right.number}</span>
                <small>Версия {right.current.version}</small>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Автор записи</TableCell>
              <TableCell>{left.author}</TableCell>
              <TableCell>{right.author}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Дата и время · МСК</TableCell>
              <TableCell className="comparison-table__date">
                {time(left.created_at)}
              </TableCell>
              <TableCell className="comparison-table__date">
                {time(right.created_at)}
              </TableCell>
            </TableRow>
            {rows.map((row) => (
              <TableRow
                key={row.key}
                className={
                  row.different ? "comparison-table__different" : undefined
                }
              >
                <TableCell>{row.name}</TableCell>
                <TableCell className="comparison-table__numeric">
                  {row.left}
                </TableCell>
                <TableCell className="comparison-table__numeric">
                  {row.right}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="comparison-table__result">
              <TableCell>Результат</TableCell>
              <TableCell>
                <span>{left.current.result_name}</span>
                <strong>
                  {number(left.current.result_value)} {left.current.result_unit}
                </strong>
              </TableCell>
              <TableCell>
                <span>{right.current.result_name}</span>
                <strong>
                  {number(right.current.result_value)}{" "}
                  {right.current.result_unit}
                </strong>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Примечание</TableCell>
              <TableCell>{left.current.note || "—"}</TableCell>
              <TableCell>{right.current.note || "—"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Последняя версия</TableCell>
              <TableCell>
                {left.current.author}
                <small>{time(left.current.created_at)} МСК</small>
              </TableCell>
              <TableCell>
                {right.current.author}
                <small>{time(right.current.created_at)} МСК</small>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
