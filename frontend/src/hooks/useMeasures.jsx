import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createMeasureRecord, SEED_MEASURES } from '../data/measures';
import {
  listMeasuresRemote,
  upsertMeasureRemote,
  deleteMeasureRemote,
  appendMeasureHistoryRemote,
} from '../utils/supabaseService';
import { getSession } from '../utils/auth';

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

// Merge remote + local by id; remote wins on conflicts (Supabase is source of truth
// once provisioned). Local-only rows are preserved so unsynced offline work isn't lost.
function mergeRemoteLocal(remote, local) {
  const byId = new Map();
  for (const m of local) byId.set(m.id, m);
  for (const m of remote) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
}

export function MeasuresProvider({ children }) {
  const [measures, setMeasures] = useState(loadInitial);
  // 'unknown' | 'synced' | 'missing-table' | 'error' — exposed for a debug badge.
  const [remoteState, setRemoteState] = useState('unknown');
  const didInitialSync = useRef(false);

  // Persist to localStorage every time measures change (offline cache / SSR fallback)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(measures));
    } catch { /* quota */ }
  }, [measures]);

  // Initial sync from Supabase. Runs once on mount. If the table is missing,
  // stays in local-only mode until the migration is applied.
  useEffect(() => {
    if (didInitialSync.current) return;
    didInitialSync.current = true;
    let cancelled = false;
    (async () => {
      const r = await listMeasuresRemote();
      if (cancelled) return;
      if (r.ok) {
        setMeasures(prev => {
          const merged = mergeRemoteLocal(r.data, prev);
          // Push any local-only rows to Supabase so they survive the next reload.
          const remoteIds = new Set(r.data.map(m => m.id));
          for (const m of prev) {
            if (!remoteIds.has(m.id)) {
              upsertMeasureRemote(m).catch(() => {});
            }
          }
          return merged;
        });
        setRemoteState('synced');
      } else if (r.missing) {
        setRemoteState('missing-table');
        // eslint-disable-next-line no-console
        console.warn('[measures] Supabase table missing — run supabase/migrations/2026-04-21_measures.sql. Using localStorage only.');
      } else {
        setRemoteState('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const createMeasure = useCallback((input) => {
    const username = getSession()?.username || null;
    const record = { ...createMeasureRecord(input), username };
    setMeasures(prev => [record, ...prev]);
    upsertMeasureRemote(record).catch(() => {});
    return record;
  }, []);

  const updateMeasure = useCallback((id, patch, { author = 'user', note = '' } = {}) => {
    setMeasures(prev => prev.map(m => {
      if (m.id !== id) return m;
      const now = new Date().toISOString();
      const nextStatus = patch.status ?? m.status;
      const statusChanged = nextStatus !== m.status;
      const historyEntry = statusChanged
        ? { ts: now, author, note, statusFrom: m.status, statusTo: nextStatus }
        : null;
      const next = {
        ...m,
        ...patch,
        updatedAt: now,
        history: historyEntry ? [...m.history, historyEntry] : m.history,
      };
      upsertMeasureRemote(next).catch(() => {});
      if (historyEntry) appendMeasureHistoryRemote(id, historyEntry).catch(() => {});
      return next;
    }));
  }, []);

  const deleteMeasure = useCallback((id) => {
    setMeasures(prev => prev.filter(m => m.id !== id));
    deleteMeasureRemote(id).catch(() => {});
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
    remoteState,
    createMeasure,
    updateMeasure,
    deleteMeasure,
    listMeasures,
    getMeasuresForElement,
  }), [measures, remoteState, createMeasure, updateMeasure, deleteMeasure, listMeasures, getMeasuresForElement]);

  return <MeasuresContext.Provider value={value}>{children}</MeasuresContext.Provider>;
}

export function useMeasures() {
  const ctx = useContext(MeasuresContext);
  if (!ctx) throw new Error('useMeasures must be used within MeasuresProvider');
  return ctx;
}
