export function formatEUR(value) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 10000000) {
    return `${sign}€${(abs / 1000000).toFixed(1)}M`;
  }
  if (abs >= 1000000) {
    return `${sign}€${(abs / 1000000).toFixed(2)}M`;
  }
  if (abs >= 1000) {
    return `${sign}€${(abs / 1000).toFixed(1)}K`;
  }
  return `${sign}€${Math.round(abs)}`;
}

export function formatPct(value, decimals = 1) {
  if (value == null || isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMonth(month, year) {
  if (typeof month === 'string') {
    const parts = month.split(' ');
    if (parts.length === 2) return parts[0];
    return month;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = months[Math.round(month) - 1] || '';
  if (year) {
    return `${m} '${String(Math.round(year)).slice(2)}`;
  }
  return m;
}
