import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Parameter, AttemptValues } from "../../domain/models";
import type { JournalDialog } from "../../app/JournalProvider";
import { useJournal } from "../../app/JournalProvider";
import { journalApi } from "../../api/client";
import { FormFrame } from "./FormFrame";
import { useSubmission } from "./useSubmission";
import {
  addParameter,
  createAttemptDraft,
  removeParameter,
  validateAttemptDraft,
} from "./attemptDraft";

export function AttemptForm({
  modal,
}: {
  modal: Extract<JournalDialog, { kind: "attempt" }>;
}) {
  const { saved } = useJournal();
  const id = useId();
  const edit = modal.edit;
  const [draft, setDraft] = useState(() =>
    createAttemptDraft(modal.experiment, edit),
  );
  const [reason, setReason] = useState("");
  const setField = (
    field: Exclude<keyof AttemptValues, "parameters">,
    value: string,
  ) => setDraft((current) => ({ ...current, [field]: value }));
  const updateParam = (index: number, field: keyof Parameter, value: string) =>
    setDraft((current) => ({
      ...current,
      parameters: current.parameters.map((parameter, i) =>
        i === index ? { ...parameter, [field]: value } : parameter,
      ),
    }));
  const submission = useSubmission(async () => {
    const validationError = validateAttemptDraft(draft);
    if (validationError) throw new Error(validationError);
    const payload = { ...draft };
    if (edit)
      await journalApi.editAttempt(edit.id, {
        ...payload,
        expected_version: edit.current.version,
        reason,
      });
    else await journalApi.createAttempt(modal.experiment.id, payload);
    saved(
      edit
        ? "Исправление сохранено новой версией"
        : "Независимая попытка добавлена",
    );
  });
  return (
    <FormFrame
      title={edit ? `Исправить попытку ${edit.number}` : "Новая попытка"}
      subtitle="Сохраняйте измерения вместе с условиями их получения."
      author={modal.author}
      edit={!!edit}
      reason={reason}
      setReason={setReason}
      {...submission}
    >
      <section
        className="record-parameters"
        aria-labelledby={`${id}-parameters`}
      >
        <div className="record-form__section-heading">
          <h3 id={`${id}-parameters`} className="record-form__section-title">
            Параметры измерений
          </h3>
          <p className="record-form__section-caption">Все поля обязательны</p>
        </div>
        <div className="record-parameters">
          {draft.parameters.map((parameter, index) => (
            <div className="record-parameter" key={index}>
              <div className="record-field record-parameter__name">
                <Label htmlFor={`${id}-parameter-${index}`}>
                  Параметр {index + 1}
                </Label>
                <Input
                  id={`${id}-parameter-${index}`}
                  autoFocus={index === 0}
                  placeholder="Температура"
                  required
                  maxLength={120}
                  value={parameter.name}
                  onChange={(event) =>
                    updateParam(index, "name", event.target.value)
                  }
                />
              </div>
              <div className="record-field record-parameter__value">
                <Label htmlFor={`${id}-value-${index}`}>
                  Значение {index + 1}
                </Label>
                <Input
                  id={`${id}-value-${index}`}
                  inputMode="decimal"
                  placeholder="20"
                  required
                  maxLength={60}
                  value={parameter.value}
                  onChange={(event) =>
                    updateParam(index, "value", event.target.value)
                  }
                />
              </div>
              <div className="record-field record-parameter__value">
                <Label htmlFor={`${id}-unit-${index}`}>
                  Единица {index + 1}
                </Label>
                <Input
                  id={`${id}-unit-${index}`}
                  placeholder="°C"
                  required
                  maxLength={40}
                  value={parameter.unit}
                  onChange={(event) =>
                    updateParam(index, "unit", event.target.value)
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="record-parameter__remove"
                disabled={draft.parameters.length <= 1}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    parameters: removeParameter(current.parameters, index),
                  }))
                }
                aria-label={`Удалить параметр ${index + 1}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={draft.parameters.length >= 50}
          onClick={() =>
            setDraft((current) => ({
              ...current,
              parameters: addParameter(current.parameters),
            }))
          }
        >
          <Plus />
          Добавить параметр
        </Button>
      </section>
      <section className="record-parameters" aria-labelledby={`${id}-result`}>
        <h3 id={`${id}-result`} className="record-form__section-title">
          Результат
        </h3>
        <div className="record-result">
          <div className="record-field record-result__name">
            <Label htmlFor={`${id}-result-name`}>Показатель *</Label>
            <Input
              id={`${id}-result-name`}
              placeholder="Растворимость"
              required
              maxLength={120}
              value={draft.result_name}
              onChange={(event) => setField("result_name", event.target.value)}
            />
          </div>
          <div className="record-field record-result__value">
            <Label htmlFor={`${id}-result-value`}>Значение *</Label>
            <Input
              id={`${id}-result-value`}
              inputMode="decimal"
              placeholder="31,6"
              required
              maxLength={60}
              value={draft.result_value}
              onChange={(event) => setField("result_value", event.target.value)}
            />
          </div>
          <div className="record-field record-result__value">
            <Label htmlFor={`${id}-result-unit`}>Единица *</Label>
            <Input
              id={`${id}-result-unit`}
              placeholder="g/100 g воды"
              required
              maxLength={40}
              value={draft.result_unit}
              onChange={(event) => setField("result_unit", event.target.value)}
            />
          </div>
        </div>
      </section>
      <div className="record-field">
        <Label htmlFor={`${id}-note`}>Примечание</Label>
        <Textarea
          id={`${id}-note`}
          rows={3}
          maxLength={6000}
          placeholder="Методика, условия, особенности измерения"
          value={draft.note}
          onChange={(event) => setField("note", event.target.value)}
        />
      </div>
    </FormFrame>
  );
}
