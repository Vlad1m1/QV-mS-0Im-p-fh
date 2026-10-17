import Decimal from "decimal.js";
import type { Attempt, ExperimentDetail } from "../../domain/models";

export interface Indicator {
  name: string;
  unit: string;
  key: string;
  label: string;
}

export interface MeasurementRow {
  attemptId: number;
  attemptNumber: number;
  version: number;
  kind: "parameter" | "result";
  name: string;
  value: string;
  unit: string;
  author: string;
  createdAt: string;
  note: string;
}

export interface StatisticRow {
  indicator: Indicator;
  count: number;
  min: string;
  max: string;
  mean: string;
}

export interface ChartPoint {
  x: number;
  y: number;
  attemptId: number;
  attemptNumber: number;
  parameterValue: string;
  resultValue: string;
}

export function sortedAttempts(attempts: readonly Attempt[]): Attempt[] {
  return [...attempts].sort((left, right) => left.number - right.number);
}

function indicator(name: string, unit: string): Indicator {
  return {
    name,
    unit,
    key: JSON.stringify([name.trim().toLocaleLowerCase("ru-RU"), unit]),
    label: `${name} · ${unit}`,
  };
}

function uniqueIndicators(values: Indicator[]): Indicator[] {
  const found = new Map<string, Indicator>();
  values.forEach((value) => {
    if (!found.has(value.key)) found.set(value.key, value);
  });
  return Array.from(found.values());
}

export function resultIndicators(attempts: readonly Attempt[]): Indicator[] {
  return uniqueIndicators(
    sortedAttempts(attempts).map(({ current }) =>
      indicator(current.result_name, current.result_unit),
    ),
  );
}

export function parameterIndicators(attempts: readonly Attempt[]): Indicator[] {
  return uniqueIndicators(
    sortedAttempts(attempts).flatMap(({ current }) =>
      current.parameters.map(({ name, unit }) => indicator(name, unit)),
    ),
  );
}

function attemptsForResult(
  attempts: readonly Attempt[],
  result: Indicator,
): Attempt[] {
  return sortedAttempts(attempts).filter(
    ({ current }) =>
      indicator(current.result_name, current.result_unit).key === result.key,
  );
}

export function measurementRows(detail: ExperimentDetail): MeasurementRow[] {
  return sortedAttempts(detail.attempts).flatMap((attempt) => {
    const current = attempt.current;
    const common = {
      attemptId: attempt.id,
      attemptNumber: attempt.number,
      version: current.version,
      author: current.author,
      createdAt: current.created_at,
      note: current.note,
    };
    return [
      ...current.parameters.map(({ name, value, unit }) => ({
        ...common,
        kind: "parameter" as const,
        name,
        value,
        unit,
      })),
      {
        ...common,
        kind: "result" as const,
        name: current.result_name,
        value: current.result_value,
        unit: current.result_unit,
      },
    ];
  });
}

interface ExactNumber {
  sign: -1 | 0 | 1;
  digits: string;
  scale: bigint;
  adjusted: bigint;
}

const unavailable = "Недоступно";
const decimalDigit = /\p{Decimal_Number}/u;

function asciiDigit(character: string): string {
  if (character >= "0" && character <= "9") return character;
  if (!decimalDigit.test(character)) return character;
  const codePoint = character.codePointAt(0)!;
  let first = codePoint;
  // Unicode decimal digit runs contain complete groups of ten, including the
  // consecutive mathematical styles. Python Decimal also accepts these digits.
  while (first > 0 && decimalDigit.test(String.fromCodePoint(first - 1)))
    first--;
  return String((codePoint - first) % 10);
}

function numericText(source: string): string {
  return Array.from(source.trim().replaceAll("_", "").replace(",", "."))
    .map(asciiDigit)
    .join("");
}

function exactNumber(source: string): ExactNumber | null {
  if (source.length > 60) return null;
  const match = numericText(source).match(
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/,
  );
  if (!match) return null;
  const fraction = match[3] ?? match[4] ?? "";
  const significant = `${match[2] ?? ""}${fraction}`.replace(/^0+/, "");
  if (!significant) return { sign: 0, digits: "0", scale: 0n, adjusted: 0n };
  const digits = significant.replace(/0+$/, "");
  const scale =
    BigInt(match[5] ?? "0") -
    BigInt(fraction.length) +
    BigInt(significant.length - digits.length);
  return {
    sign: match[1] === "-" ? -1 : 1,
    digits,
    scale,
    adjusted: scale + BigInt(digits.length - 1),
  };
}

function compareExact(left: ExactNumber, right: ExactNumber): number {
  if (left.sign !== right.sign) return left.sign - right.sign;
  if (left.sign === 0) return 0;
  if (left.adjusted !== right.adjusted)
    return (left.adjusted < right.adjusted ? -1 : 1) * left.sign;
  const width = Math.max(left.digits.length, right.digits.length);
  const a = left.digits.padEnd(width, "0");
  const b = right.digits.padEnd(width, "0");
  return a === b ? 0 : (a < b ? -1 : 1) * left.sign;
}

function meanText(values: ExactNumber[]): string {
  const nonzero = values.filter((value) => value.sign !== 0);
  if (!nonzero.length) return "0";
  const minimumScale = nonzero.reduce(
    (minimum, value) => (value.scale < minimum ? value.scale : minimum),
    nonzero[0].scale,
  );
  const maximumAdjusted = nonzero.reduce(
    (maximum, value) => (value.adjusted > maximum ? value.adjusted : maximum),
    nonzero[0].adjusted,
  );
  const requiredPrecision =
    maximumAdjusted - minimumScale + BigInt(String(values.length).length) + 2n;
  // Do not allocate a decimal context proportional to an untrusted exponent.
  // Shifting all values first also keeps huge absolute exponents representable.
  if (requiredPrecision > 10_000n) return unavailable;
  const ExactDecimal = Decimal.clone({
    precision: Math.max(50, Number(requiredPrecision)),
    rounding: Decimal.ROUND_HALF_EVEN,
  });
  try {
    const sum = nonzero.reduce(
      (total, value) =>
        total.plus(
          `${value.sign < 0 ? "-" : ""}${value.digits}e${value.scale - minimumScale}`,
        ),
      new ExactDecimal(0),
    );
    if (sum.isZero()) return "0";
    const rounded = sum.div(values.length).toSignificantDigits(12);
    const [coefficient, exponent] = rounded.toExponential().split("e");
    const adjusted = BigInt(exponent) + minimumScale;
    if (adjusted < -4n || adjusted >= 12n)
      return `${coefficient}e${adjusted >= 0n ? "+" : ""}${adjusted}`;
    const sign = coefficient.startsWith("-") ? "-" : "";
    const digits = coefficient.replace("-", "").replace(".", "");
    const point = Number(adjusted) + 1;
    if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
    if (point >= digits.length)
      return `${sign}${digits}${"0".repeat(point - digits.length)}`;
    return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
  } catch {
    return unavailable;
  }
}

export function descriptiveRows(attempts: readonly Attempt[]): StatisticRow[] {
  return resultIndicators(attempts).map((result) => {
    const source = attemptsForResult(attempts, result).map(
      ({ current }) => current.result_value,
    );
    const parsed = source.map(exactNumber);
    if (parsed.some((value) => value === null))
      return {
        indicator: result,
        count: source.length,
        min: unavailable,
        max: unavailable,
        mean: unavailable,
      };
    const values = parsed as ExactNumber[];
    let minimum = 0;
    let maximum = 0;
    values.forEach((value, index) => {
      if (compareExact(value, values[minimum]) < 0) minimum = index;
      if (compareExact(value, values[maximum]) > 0) maximum = index;
    });
    return {
      indicator: result,
      count: source.length,
      min: source[minimum],
      max: source[maximum],
      mean: meanText(values),
    };
  });
}

function plotNumber(source: string): number | null {
  const parsed = exactNumber(source);
  if (!parsed) return null;
  const number = Number(numericText(source));
  return Number.isFinite(number) && (number !== 0 || parsed.sign === 0)
    ? number
    : null;
}

export function chartPoints(
  attempts: readonly Attempt[],
  parameter: Indicator,
  result: Indicator,
): { points: ChartPoint[]; skipped: number } {
  const points: ChartPoint[] = [];
  let skipped = 0;
  for (const attempt of attemptsForResult(attempts, result)) {
    const { current } = attempt;
    const measurement = current.parameters.find(
      ({ name, unit }) => indicator(name, unit).key === parameter.key,
    );
    const x = measurement ? plotNumber(measurement.value) : null;
    const y = plotNumber(current.result_value);
    if (!measurement || x === null || y === null) {
      skipped++;
      continue;
    }
    points.push({
      x,
      y,
      attemptId: attempt.id,
      attemptNumber: attempt.number,
      parameterValue: measurement.value,
      resultValue: current.result_value,
    });
  }
  // A finite pair of endpoints can still have an infinite span. Never pass
  // that domain to a chart library, which may loop while calculating ticks.
  for (const axis of ["x", "y"] as const) {
    if (!points.length) break;
    let minimum = points[0][axis];
    let maximum = minimum;
    for (const point of points) {
      minimum = Math.min(minimum, point[axis]);
      maximum = Math.max(maximum, point[axis]);
    }
    if (!Number.isFinite(maximum - minimum))
      return { points: [], skipped: skipped + points.length };
  }
  return { points, skipped };
}
