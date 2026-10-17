import type { JournalDialog } from "../../app/JournalProvider";
import { AttemptForm } from "./AttemptForm";
import { ExperimentForm } from "./ExperimentForm";
import { ObservationForm } from "./ObservationForm";

export function RecordDialog({ modal }: { modal: JournalDialog }) {
  switch (modal.kind) {
    case "experiment":
      return <ExperimentForm modal={modal} />;
    case "attempt":
      return <AttemptForm modal={modal} />;
    case "observation":
      return <ObservationForm modal={modal} />;
  }
}
