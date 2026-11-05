export function fmt(n?: number | null): string {
  if (n == null || isNaN(n)) return '-';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export function fmtPct(n?: number): string {
  if (n == null || isNaN(n)) return '-';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

export function cls(n?: number): string {
  if (n == null) return '';
  return n >= 0 ? 'up' : 'down';
}
