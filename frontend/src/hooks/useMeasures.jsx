import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { createMeasureRecord, SEED_MEASURES } from '../data/measures';

const MeasuresContext = createContext(null);

const STORAGE_KEY = 'scherzinger_measures_v1';

function loadInitial() {
  if (typeof window === 'undefined') return SEED_MEASURES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_MEASURES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_MEASURES;
  } catch {
    return SEED_MEASURES;
  }
}

export function MeasuresProvider({ children }) {
  const [measures, setMeasures] = useState(loadInitial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(measures));
    } catch {
      // ignore quota errors
    }
  }, [measures]);

  const createMeasure = useCallback((input) => {
    const record = createMeasureRecord(input);
    setMeasures(prev => [record, ...prev]);
    return record;
  }, []);

  const updateMeasure = useCallback((id, patch, { author = 'user', note = '' } = {}) => {
    setMeasures(prev => prev.map(m => {
      if (m.id !== id) return m;
      const now = new Date().toISOString();
      const nextStatus = patch.status ?? m.status;
      const history = nextStatus !== m.status
        ? [...m.history, { ts: now, author, note, statusFrom: m.status, statusTo: nextStatus }]
        : m.history;
      return { ...m, ...patch, updatedAt: now, history };
    }));
  }, []);

  const deleteMeasure = useCallback((id) => {
    setMeasures(prev => prev.filter(m => m.id !== id));
  }, []);

  const listMeasures = useCallback((filters = {}) => {
    return measures.filter(m => {
      if (filters.status && filters.status !== 'all' && m.status !== filters.status) return false;
      if (filters.owner && filters.owner !== 'all' && m.owner !== filters.owner) return false;
      if (filters.sourceDashboard && filters.sourceDashboard !== 'all' && m.sourceDashboard !== filters.sourceDashboard) return false;
      return true;
    });
  }, [measures]);

  const getMeasuresForElement = useCallback((elementId) => {
    if (!elementId) return [];
    return measures.filter(m => m.sourceElementId === elementId);
  }, [measures]);

  const value = useMemo(() => ({
    measures,
    createMeasure,
    updateMeasure,
    deleteMeasure,
    listMeasures,
    getMeasuresForElement,
  }), [measures, createMeasure, updateMeasure, deleteMeasure, listMeasures, getMeasuresForElement]);

  return <MeasuresContext.Provider value={value}>{children}</MeasuresContext.Provider>;
}

export function useMeasures() {
  const ctx = useContext(MeasuresContext);
  if (!ctx) throw new Error('useMeasures must be used within MeasuresProvider');
  return ctx;
}
