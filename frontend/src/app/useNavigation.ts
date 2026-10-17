import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export function parseHash(hash: string): number | null {
  const match = hash.match(/^#experiment=([1-9]\d*)$/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) ? id : null;
}
export function useNavigation() {
  const [selectedId, setSelectedId] = useState(() =>
    parseHash(window.location.hash),
  );
  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const listener = () => setSelectedId(parseHash(window.location.hash));
    window.addEventListener("hashchange", listener);
    return () => {
      window.removeEventListener("hashchange", listener);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [selectedId]);
  const navigate = useCallback((id: number | null) => {
    window.location.hash = id === null ? "" : `experiment=${id}`;
    setSelectedId(id);
  }, []);
  return { selectedId, navigate };
}
