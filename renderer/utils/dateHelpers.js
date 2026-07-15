// =============================================================================
// renderer/utils/dateHelpers.js — دوال مساعدة للتواريخ
// All storage dates are ISO yyyy-mm-dd. Display honors the user's date_format
// setting (dd/mm/yyyy | yyyy-mm-dd).
// =============================================================================

// ISO yyyy-mm-dd for a Date (local).
export function toISODate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return toISODate(new Date());
}

// Add N days to an ISO date, return ISO.
export function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// Format an ISO date per the user's preference.
export function formatDate(iso, format = 'dd/mm/yyyy') {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  if (!y || !m || !d) return iso;
  return format === 'yyyy-mm-dd' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
}

// Format an ISO timestamp (with time) for logs.
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Days until (positive) or since (negative) an ISO due date, relative to today.
export function daysUntil(iso) {
  if (!iso) return null;
  const due = new Date(iso + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

// Human relative label in Arabic.
export function dueLabel(iso) {
  const n = daysUntil(iso);
  if (n === null) return '';
  if (n < 0) return `متأخر ${Math.abs(n)} يوم`;
  if (n === 0) return 'يستحق اليوم';
  if (n === 1) return 'يستحق غداً';
  return `خلال ${n} يوم`;
}

// Is the ISO date within [today, today+days]?
export function isDueWithin(iso, days) {
  const n = daysUntil(iso);
  return n !== null && n >= 0 && n <= days;
}

export function isOverdue(iso) {
  const n = daysUntil(iso);
  return n !== null && n < 0;
}
