// =============================================================================
// renderer/lib/format.js — تنسيق العملة وحالات الشيكات
// =============================================================================

export const STATUS_META = {
  open: { label: 'مفتوح', cls: 'bg-sky-100 text-sky-700' },
  collected: { label: 'محصّل', cls: 'bg-emerald-100 text-emerald-700' },
  returned: { label: 'مرتجع', cls: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'ملغي', cls: 'bg-slate-200 text-slate-600' },
};

export const STATUS_OPTIONS = [
  { value: 'open', label: 'مفتوح' },
  { value: 'collected', label: 'محصّل' },
  { value: 'returned', label: 'مرتجع' },
  { value: 'cancelled', label: 'ملغي' },
];

export function statusLabel(status) {
  return (STATUS_META[status] || {}).label || status;
}

export function statusClass(status) {
  return (STATUS_META[status] || {}).cls || 'bg-slate-100 text-slate-600';
}

// Format a numeric amount with grouping + up to 3 fils digits.
export function formatAmount(n, currency = '') {
  const v = Number(n) || 0;
  const s = v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return currency ? `${s} ${currency}` : s;
}
