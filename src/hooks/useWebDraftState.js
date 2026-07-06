import { useEffect, useRef, useState } from "react";

function readWebDraft(storageKey, fallbackValue) {
  if (!storageKey || typeof window === "undefined") return fallbackValue;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallbackValue;
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      fallbackValue &&
      typeof parsed === "object" &&
      typeof fallbackValue === "object" &&
      !Array.isArray(parsed) &&
      !Array.isArray(fallbackValue)
    ) {
      return { ...fallbackValue, ...parsed };
    }

    return parsed;
  } catch {
    return fallbackValue;
  }
}

export function useWebDraftState(storageKey, fallbackValue) {
  const fallbackRef = useRef(fallbackValue);
  const [state, setState] = useState(() => readWebDraft(storageKey, fallbackValue));

  useEffect(() => {
    fallbackRef.current = fallbackValue;
  }, [fallbackValue]);

  useEffect(() => {
    setState(readWebDraft(storageKey, fallbackValue));
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore quota or serialization errors and keep the in-memory state.
    }
  }, [storageKey, state]);

  function reset(nextValue = fallbackRef.current) {
    setState(nextValue);
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextValue));
    } catch {
      // Ignore storage failures and keep the in-memory state.
    }
  }

  return [state, setState, reset];
}
