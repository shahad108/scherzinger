import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';

const RANGE_DAYS = { today: 0, '7d': 7, '30d': 30, '90d': 90 };

export function useDateRange() {
  const { dateRange, setDateRange } = useOutletContext();

  const { from, to } = useMemo(() => {
    const now = new Date();
    const toDate = now.toISOString();
    const days = RANGE_DAYS[dateRange] ?? 7;
    const fromDate = days === 0
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      : new Date(Date.now() - days * 86400000).toISOString();
    return { from: fromDate, to: toDate };
  }, [dateRange]);

  return { dateRange, setDateRange, from, to };
}
