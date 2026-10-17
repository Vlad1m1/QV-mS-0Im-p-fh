import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Attempt, Author, ExperimentDetail } from "../domain/models";
import { JournalStore } from "../api/journalStore";
import { useQuery } from "../api/useQuery";
import { useFilters } from "./useFilters";
import { useNavigation } from "./useNavigation";
import { useAuthenticatedUser } from "../auth/AuthProvider";

export type DialogRequest =
  | { kind: "experiment"; edit?: ExperimentDetail }
  | { kind: "attempt"; experiment: ExperimentDetail; edit?: Attempt }
  | { kind: "observation"; experiment: ExperimentDetail };
export type JournalDialog = DialogRequest & { author: Author };

function useJournalController() {
  const store = useMemo(() => new JournalStore(), []);
  const authorsQuery = useQuery(store.authors);
  const authors = authorsQuery.data ?? [];
  const user = useAuthenticatedUser();
  const currentAuthor: Author = { id: user.author_id, name: user.name };
  const navigation = useNavigation();
  const filters = useFilters();
  const [modal, setModal] = useState<JournalDialog | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const interval = setInterval(() => store.refresh(), 10000);
    return () => clearInterval(interval);
  }, [store]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const closeModal = useCallback(() => setModal(null), []);
  const openModal = (request: DialogRequest) => {
    // The form edits the version and author selected when it was opened.
    // Background refreshes never replace the draft or its optimistic lock.
    setModal({ ...request, author: currentAuthor });
  };
  const refresh = useCallback(() => {
    setError("");
    store.refresh();
  }, [store]);
  const saved = (message: string, id?: number) => {
    setModal(null);
    setToast(message);
    store.refresh();
    if (id !== undefined && id !== navigation.selectedId)
      navigation.navigate(id);
  };
  return {
    store,
    authors,
    currentAuthor,
    ...navigation,
    ...filters,
    modal,
    openModal,
    closeModal,
    saved,
    refresh,
    toast,
    notify: setToast,
    error: error || authorsQuery.error,
    reportError: setError,
  };
}
const JournalContext = createContext<ReturnType<
  typeof useJournalController
> | null>(null);
export function JournalProvider({ children }: { children: ReactNode }) {
  return (
    <JournalContext.Provider value={useJournalController()}>
      {children}
    </JournalContext.Provider>
  );
}
export function useJournal() {
  const value = useContext(JournalContext);
  if (!value) throw new Error("JournalProvider is required");
  return value;
}
