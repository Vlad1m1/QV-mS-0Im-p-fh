import { useId, useState } from "react";
import { Plus, UserRound, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ExperimentValues, WorkMode } from "../../domain/models";
import type { JournalDialog } from "../../app/JournalProvider";
import { useJournal } from "../../app/JournalProvider";
import { journalApi } from "../../api/client";
import { today } from "../../shared/format";
import { FormFrame } from "./FormFrame";
import { useSubmission } from "./useSubmission";

export function ExperimentForm({
  modal,
}: {
  modal: Extract<JournalDialog, { kind: "experiment" }>;
}) {
  const { saved } = useJournal();
  const id = useId();
  const edit = modal.edit;
  const [draft, setDraft] = useState<ExperimentValues>(() =>
    edit
      ? { title: edit.title, objective: edit.objective, date: edit.date }
      : { title: "", objective: "", date: today() },
  );
  const [reason, setReason] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode>("solo");
  const [emails, setEmails] = useState([""]);
  const setField = (field: keyof ExperimentValues, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const submission = useSubmission(async () => {
    const payload = { ...draft };
    const collaborators = emails.map((email) => email.trim()).filter(Boolean);
    if (!edit && workMode === "shared" && !collaborators.length)
      throw new Error(
        "Укажите почту хотя бы одного участника совместной работы.",
      );
    const row = edit
      ? await journalApi.editExperiment(edit.id, {
          ...payload,
          expected_version: edit.version,
          reason,
        })
      : await journalApi.createExperiment({
          ...payload,
          work_mode: workMode,
          collaborator_emails: workMode === "shared" ? collaborators : [],
        });
    saved(
      edit
        ? "Карточка исправлена. Предыдущие данные сохранены в истории."
        : "Эксперимент создан",
      row.id,
    );
  });
  return (
    <FormFrame
      title={edit ? "Изменить эксперимент" : "Новый эксперимент"}
      subtitle={
        edit
          ? "Уточните карточку. Предыдущая версия останется в истории."
          : "Задайте цель и выберите, кто будет работать над исследованием."
      }
      author={modal.author}
      edit={!!edit}
      reason={reason}
      setReason={setReason}
      {...submission}
    >
      {!edit && (
        <section className="work-mode" aria-labelledby={`${id}-mode-label`}>
          <h3 id={`${id}-mode-label`} className="record-form__section-title">
            Вид работы
          </h3>
          <RadioGroup
            aria-labelledby={`${id}-mode-label`}
            value={workMode}
            onValueChange={(value) => setWorkMode(value as WorkMode)}
            disabled={submission.busy}
            className="work-mode__options"
          >
            <Label
              htmlFor={`${id}-solo`}
              className="work-mode__option"
              data-selected={workMode === "solo"}
            >
              <RadioGroupItem value="solo" id={`${id}-solo`} />
              <UserRound className="work-mode__icon" />
              <span className="work-mode__copy">
                <span className="work-mode__title">Одиночная</span>
                <span className="work-mode__description">
                  Доступ только у вас
                </span>
              </span>
            </Label>
            <Label
              htmlFor={`${id}-shared`}
              className="work-mode__option"
              data-selected={workMode === "shared"}
            >
              <RadioGroupItem value="shared" id={`${id}-shared`} />
              <Users className="work-mode__icon" />
              <span className="work-mode__copy">
                <span className="work-mode__title">Совместная</span>
                <span className="work-mode__description">
                  Вы и выбранные участники
                </span>
              </span>
            </Label>
          </RadioGroup>
          {workMode === "shared" && (
            <div className="collaborators">
              <p id={`${id}-collaborator-hint`} className="collaborators__hint">
                Укажите email участников, зарегистрированных в PersonalJournal.
                Доступ к эксперименту будет у вас и выбранных участников.
                Приглашения по почте не отправляются.
              </p>
              {emails.map((email, index) => (
                <div className="collaborators__row" key={index}>
                  <div className="record-field collaborators__email">
                    <Label htmlFor={`${id}-collaborator-${index}`}>
                      Почта участника {index + 1}
                    </Label>
                    <Input
                      id={`${id}-collaborator-${index}`}
                      type="email"
                      required
                      maxLength={254}
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="colleague@university.ru"
                      aria-describedby={`${id}-collaborator-hint`}
                      value={email}
                      onChange={(event) =>
                        setEmails((current) =>
                          current.map((value, position) =>
                            position === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                  </div>
                  {emails.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="collaborators__remove"
                      aria-label={`Удалить участника ${index + 1}`}
                      onClick={() =>
                        setEmails((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
              {emails.length < 20 && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setEmails((current) => [...current, ""])}
                >
                  <Plus /> Добавить участника
                </Button>
              )}
            </div>
          )}
        </section>
      )}
      <div className="record-field">
        <Label htmlFor={`${id}-title`}>Название эксперимента *</Label>
        <Input
          id={`${id}-title`}
          autoFocus
          required
          maxLength={200}
          placeholder="Например, влияние температуры на растворимость"
          value={draft.title}
          onChange={(event) => setField("title", event.target.value)}
        />
      </div>
      <div className="record-field">
        <Label htmlFor={`${id}-objective`}>
          Гипотеза или цель исследования *
        </Label>
        <Textarea
          id={`${id}-objective`}
          required
          maxLength={6000}
          rows={5}
          placeholder="Что вы хотите проверить? Укажите методику и постоянные условия."
          value={draft.objective}
          onChange={(event) => setField("objective", event.target.value)}
        />
      </div>
      <div className="record-field record-field--date">
        <Label htmlFor={`${id}-date`}>Дата эксперимента *</Label>
        <Input
          id={`${id}-date`}
          type="date"
          required
          value={draft.date}
          onChange={(event) => setField("date", event.target.value)}
          onInput={(event) => setField("date", event.currentTarget.value)}
          onBlur={(event) => setField("date", event.currentTarget.value)}
        />
      </div>
    </FormFrame>
  );
}
