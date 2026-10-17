import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { toast as showToast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JournalProvider, useJournal } from "./app/JournalProvider";
import { JournalShell } from "./app/JournalShell";
import { ExperimentList } from "./features/experiments/ExperimentList";
import { ExperimentDetail } from "./features/experiments/ExperimentDetail";
import { RecordDialog } from "./features/forms/RecordDialog";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthGate } from "./auth/AuthGate";

function JournalApp() {
  const { selectedId, error, refresh, toast, modal } = useJournal();
  useEffect(() => {
    if (!toast) return;
    const id = showToast(toast);
    return () => {
      showToast.dismiss(id);
    };
  }, [toast]);
  return (
    <>
      <JournalShell>
        {error && (
          <Alert className="app-feedback">
            <AlertCircle />
            <AlertDescription>
              {error}
              <Button variant="outline" size="sm" onClick={refresh}>
                Повторить
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {selectedId === null ? (
          <ExperimentList />
        ) : (
          <ExperimentDetail id={selectedId} key={selectedId} />
        )}
      </JournalShell>
      {modal && <RecordDialog modal={modal} />}
    </>
  );
}
function AuthenticatedJournal() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  return (
    <JournalProvider key={state.generation}>
      <JournalApp />
    </JournalProvider>
  );
}
export function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <AuthGate>
          <AuthenticatedJournal />
        </AuthGate>
        <Toaster position="bottom-right" duration={4500} closeButton />
      </TooltipProvider>
    </AuthProvider>
  );
}
