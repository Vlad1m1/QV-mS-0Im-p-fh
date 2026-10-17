import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { JournalDialog } from "../../app/JournalProvider";
import { useJournal } from "../../app/JournalProvider";
import { journalApi } from "../../api/client";
import { FormFrame } from "./FormFrame";
import { useSubmission } from "./useSubmission";

export function ObservationForm({
  modal,
}: {
  modal: Extract<JournalDialog, { kind: "observation" }>;
}) {
  const { saved } = useJournal();
  const contentId = useId();
  const [content, setContent] = useState("");
  const submission = useSubmission(async () => {
    await journalApi.addObservation(modal.experiment.id, content);
    saved("Наблюдение добавлено в журнал");
  });
  return (
    <FormFrame
      title="Добавить наблюдение"
      subtitle="Запишите условия и детали, важные для повторения исследования."
      author={modal.author}
      {...submission}
    >
      <div className="record-field">
        <Label htmlFor={contentId}>Наблюдение *</Label>
        <Textarea
          id={contentId}
          autoFocus
          required
          rows={6}
          maxLength={6000}
          placeholder="Опишите наблюдения и условия, важные для исследования"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>
    </FormFrame>
  );
}
