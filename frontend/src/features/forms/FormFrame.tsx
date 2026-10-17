import { useId, useRef, type FormEvent, type ReactNode } from "react";
import {
  Check,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Author } from "../../domain/models";
import { useJournal } from "../../app/JournalProvider";
import { UserAvatar } from "../../shared/identity";

interface FormFrameProps {
  title: string;
  subtitle: string;
  author: Author;
  edit?: boolean;
  reason?: string;
  setReason?: (reason: string) => void;
  busy: boolean;
  error: string;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

export function FormFrame({
  title,
  subtitle,
  author,
  edit = false,
  reason = "",
  setReason,
  busy,
  error,
  submit,
  children,
}: FormFrameProps) {
  const { closeModal } = useJournal();
  const reasonId = useId();
  const returnFocus = useRef(document.activeElement);
  const close = () => {
    if (!busy) closeModal();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="record-dialog"
        showCloseButton={!busy}
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
        onInteractOutside={(event) => busy && event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current instanceof HTMLElement)
            returnFocus.current.focus({ preventScroll: true });
        }}
      >
        <DialogHeader className="record-dialog__header">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="record-form">
          <div className="record-form__body">
            <div className="record-form__author">
              <UserAvatar name={author.name} className="record-form__avatar" />
              <p className="record-form__author-name">
                <span className="record-form__author-label">
                  Автор {edit ? "исправления" : "записи"}
                </span>
                <strong className="record-form__author-value">
                  {author.name}
                </strong>
              </p>
              <span className="record-form__auto-date">
                <Clock3 className="record-form__small-icon" />
                Время — автоматически
              </span>
            </div>
            <fieldset disabled={busy} className="record-form__fields">
              {children}
              {edit && (
                <div className="record-form__correction">
                  <div className="record-field">
                    <Label htmlFor={reasonId}>Причина исправления *</Label>
                    <Textarea
                      id={reasonId}
                      required
                      rows={2}
                      maxLength={1000}
                      placeholder="Что исправлено и почему?"
                      value={reason}
                      onChange={(event) => setReason?.(event.target.value)}
                    />
                  </div>
                </div>
              )}
            </fieldset>
            {error && (
              <Alert>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="record-dialog__footer">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={busy}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="record-form__spinner" />
              ) : (
                <Check />
              )}
              {busy
                ? "Сохранение…"
                : edit
                  ? "Сохранить исправление"
                  : "Сохранить запись"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
