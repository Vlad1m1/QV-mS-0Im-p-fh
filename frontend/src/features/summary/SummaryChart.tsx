import {
  CartesianGrid,
  ResponsiveContainer,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint, Indicator } from "./summary";

const standard = new Intl.NumberFormat("ru-RU", {
  maximumSignificantDigits: 6,
});
const scientific = new Intl.NumberFormat("ru-RU", {
  notation: "scientific",
  maximumSignificantDigits: 4,
});

function tick(value: number) {
  const magnitude = Math.abs(value);
  return (
    magnitude >= 1e7 || (magnitude > 0 && magnitude < 1e-4)
      ? scientific
      : standard
  ).format(value);
}

export function chartDomain([minimum, maximum]: readonly [number, number]): [
  number,
  number,
] {
  const span = maximum - minimum;
  const padding = Math.max(
    span > 0 ? span * 0.08 : Math.abs(minimum) * 0.08 || 1,
    Number.MIN_VALUE,
  );
  const lower = minimum - padding;
  const upper = maximum + padding;
  const safeLower = Number.isFinite(lower) ? lower : minimum;
  const safeUpper = Number.isFinite(upper) ? upper : maximum;
  return Number.isFinite(safeUpper - safeLower) && safeUpper > safeLower
    ? [safeLower, safeUpper]
    : [minimum, maximum];
}

export function SummaryChart({
  parameter,
  result,
  points,
}: {
  parameter: Indicator;
  result: Indicator;
  points: ChartPoint[];
}) {
  if (!points.length)
    return (
      <p className="summary-panel__chart-empty">
        Нет попыток с выбранной парой показателей.
      </p>
    );

  const orderedPoints = [...points].sort(
    (left, right) =>
      left.x - right.x || left.attemptNumber - right.attemptNumber,
  );

  return (
    <div
      className="summary-chart"
      role="img"
      aria-label={`${result.label} от ${parameter.label}. Точек: ${points.length}. Линия соединяет измерения по возрастанию параметра. Исходные значения приведены в таблице измерений.`}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 640, height: 300 }}
      >
        <LineChart
          data={orderedPoints}
          margin={{ top: 16, right: 20, bottom: 10, left: 4 }}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name={parameter.name}
            domain={chartDomain}
            allowDataOverflow
            tickFormatter={tick}
            tickLine={false}
            axisLine={{ stroke: "var(--input)" }}
            minTickGap={32}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={result.name}
            domain={chartDomain}
            allowDataOverflow
            tickFormatter={tick}
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeDasharray: "3 3",
            }}
            labelFormatter={(_label, payload) => {
              const point = payload[0]?.payload as ChartPoint | undefined;
              return point
                ? `Попытка ${point.attemptNumber} · ${parameter.name}: ${point.parameterValue} ${parameter.unit}`
                : "";
            }}
            formatter={(_value, _name, entry) => {
              const point = entry.payload as ChartPoint;
              return [`${point.resultValue} ${result.unit}`, result.name];
            }}
          />
          <Line
            type="linear"
            dataKey="y"
            name={result.name}
            stroke="var(--foreground)"
            strokeWidth={2}
            dot={{ r: 3.5, fill: "var(--foreground)", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--foreground)", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
