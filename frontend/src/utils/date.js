// frontend/src/utils/date.js

/** YYYY-MM-DD for a given IANA timezone (default: America/Toronto) */
export function todayISOInToronto(tz = 'America/Toronto') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD using the machine’s local timezone */
export function toISODateLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD for an arbitrary Date in a specific timezone */
export function toISOInTZ(date = new Date(), tz = 'America/Toronto') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/** Parse 'YYYY-MM-DD' to a Date at midnight in local time */
export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/** Pretty label for 'YYYY-MM-DD' (Toronto timezone by default) */
export function toDisplayDate(iso, tz = 'America/Toronto') {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  // Use UTC date then format in the target tz to avoid DST weirdness
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });
  return fmt.format(date); // e.g., "Wed, Aug 13, 2025"
}

/** Simple helpers */
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODateLocal(d);
}

export function isSameDay(aISO, bISO) {
  return String(aISO) === String(bISO);
}

/* ── Compatibility aliases (for older imports) ──────────────────────────── */
// Older files might import these names. Keep them thin and obvious.
export function getLocalTodayISO() {
  return toISODateLocal(new Date());
}
export function todayISO() {
  return toISODateLocal(new Date());
}
export function todayISOInTZ(tz = 'America/Toronto') {
  return toISOInTZ(new Date(), tz);
}
