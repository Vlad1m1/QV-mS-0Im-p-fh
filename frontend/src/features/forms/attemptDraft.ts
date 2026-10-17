import type {
  Attempt,
  AttemptValues,
  ExperimentDetail,
  Parameter,
} from "../../domain/models";

const blankParameter = (): Parameter => ({ name: "", value: "", unit: "" });
export function createAttemptDraft(
  experiment: ExperimentDetail,
  edit?: Attempt,
): AttemptValues {
  const source = edit?.current;
  const last = experiment.attempts.at(-1)?.current;
  return {
    parameters: source
      ? source.parameters.map((parameter) => ({ ...parameter }))
      : last
        ? last.parameters.map((parameter) => ({ ...parameter, value: "" }))
        : [blankParameter()],
    result_name: source?.result_name ?? last?.result_name ?? "",
    result_value: source?.result_value ?? "",
    result_unit: source?.result_unit ?? last?.result_unit ?? "",
    note: source?.note ?? "",
  };
}
export function addParameter(parameters: Parameter[]): Parameter[] {
  return parameters.length >= 50
    ? parameters
    : [...parameters, blankParameter()];
}
export function removeParameter(
  parameters: Parameter[],
  index: number,
): Parameter[] {
  return parameters.length <= 1
    ? parameters
    : parameters.filter((_, i) => i !== index);
}
export function validateAttemptDraft(draft: AttemptValues): string {
  if (draft.parameters.length < 1 || draft.parameters.length > 50)
    return "Укажите от 1 до 50 параметров.";
  const names = draft.parameters.map((parameter) =>
    parameter.name.trim().toLocaleLowerCase("ru-RU"),
  );
  if (new Set(names).size !== names.length)
    return "Названия параметров не должны повторяться.";
  if (
    draft.parameters.some(
      (parameter) => !parameter.name.trim() || !parameter.unit.trim(),
    ) ||
    !draft.result_name.trim() ||
    !draft.result_unit.trim()
  )
    return "Укажите названия показателей и единицы измерения.";
  // Decimal parsing belongs to the server; JS Number would lose precision and
  // reject finite Decimal values outside the IEEE-754 range.
  return "";
}
