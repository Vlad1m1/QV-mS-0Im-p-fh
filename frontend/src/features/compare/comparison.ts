import type { Attempt, Parameter } from "../../domain/models";
import { number } from "../../shared/format";

const parameterKey = (parameter: Parameter) =>
  parameter.name.trim().toLocaleLowerCase("ru-RU");
const measurement = (parameter?: Parameter) =>
  parameter ? `${number(parameter.value)} ${parameter.unit}` : "Не измерялось";

export function comparisonPair(
  attempts: Attempt[],
  leftId: number,
  rightId: number,
): [Attempt, Attempt] | null {
  if (attempts.length < 2) return null;
  const left = attempts.find((attempt) => attempt.id === leftId) ?? attempts[0];
  const right =
    attempts.find(
      (attempt) => attempt.id === rightId && attempt.id !== left.id,
    ) ?? attempts.find((attempt) => attempt.id !== left.id)!;
  return [left, right];
}
export function comparisonRows(left: Attempt, right: Attempt) {
  const leftParameters = new Map(
    left.current.parameters.map((parameter) => [
      parameterKey(parameter),
      parameter,
    ]),
  );
  const rightParameters = new Map(
    right.current.parameters.map((parameter) => [
      parameterKey(parameter),
      parameter,
    ]),
  );
  return Array.from(
    new Set([...leftParameters.keys(), ...rightParameters.keys()]),
  ).map((key) => {
    const l = leftParameters.get(key);
    const r = rightParameters.get(key);
    return {
      key,
      name: l?.name ?? r!.name,
      left: measurement(l),
      right: measurement(r),
      different: measurement(l) !== measurement(r),
    };
  });
}
