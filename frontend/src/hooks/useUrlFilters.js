import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const KEYS = ['commodity', 'risk', 'prompt', 'segment'];

export function useUrlFilters() {
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(() => {
    const out = {};
    for (const k of KEYS) {
      const v = sp.get(k);
      if (v) out[k] = v;
    }
    return out;
  }, [sp]);

  const setFilter = useCallback((key, value) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSp]);

  const clearFilter = useCallback((key) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      next.delete(key);
      return next;
    }, { replace: true });
  }, [setSp]);

  return { filters, setFilter, clearFilter };
}
