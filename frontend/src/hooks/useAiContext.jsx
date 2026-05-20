import { createContext, useContext, useState, useCallback, useMemo } from 'react';

// Tracks which dashboard element is currently "focused" for Ask-AI.
// Any dashboard element (chart, KPI, table) can call setFocus on hover/click;
// the global chat bar reads the current focus and grounds its queries in it.

const AiContext = createContext(null);

export function AiContextProvider({ children }) {
  const [focus, setFocusState] = useState(null); // { elementId, label, payload }

  const setFocus = useCallback((elementId, details = {}) => {
    if (!elementId) return;
    setFocusState({
      elementId,
      label: details.label ?? elementId,
      payload: details.payload ?? null,
      dashboard: details.dashboard ?? null,
    });
  }, []);

  const clearFocus = useCallback(() => setFocusState(null), []);

  const value = useMemo(() => ({ focus, setFocus, clearFocus }), [focus, setFocus, clearFocus]);
  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}

export function useAiContext() {
  const ctx = useContext(AiContext);
  if (!ctx) {
    // Non-fatal: return a safe no-op so components outside the provider don't crash.
    return { focus: null, setFocus: () => {}, clearFocus: () => {} };
  }
  return ctx;
}

export function useFocus() {
  return useAiContext().focus;
}
