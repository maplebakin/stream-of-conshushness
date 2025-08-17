// frontend/src/utils/display.js
// Render-safe helpers + recurrence formatter used across the UI.

/** Safely stringify anything for JSX without making React cry. */
export function toDisplay(v) {
  if (v == null) return '';
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const prim = v.every(x => x == null || ['string','number','boolean'].includes(typeof x));
    return prim ? v.join(', ') : JSON.stringify(v);
  }
  return JSON.stringify(v);
}

/**
 * Humanize a recurrence object like:
 *   { unit: 'day'|'week'|'month', interval: number, byDay?: string[] }
 * where byDay is like ['MO','TU'].
 */
export function formatRecurrence(r) {
  if (!r || typeof r !== 'object') return '';
  const unit = r.unit || r.freq || r.frequency; // tolerate alternate keys
  const interval = Number(r.interval || r.every || 1) || 1;
  const byDay = Array.isArray(r.byDay || r.byday) ? (r.byDay || r.byday) : [];

  const unitLabel = (u) => {
    if (!u) return '';
    const base = String(u).toLowerCase();
    if (interval > 1) {
      if (base.endsWith('y')) return base.slice(0, -1) + 'ies'; // day → daies? no. handle below
      if (base === 'day') return 'days';
      if (base === 'week') return 'weeks';
      if (base === 'month') return 'months';
    }
    return base;
  };

  if (unit === 'week' && byDay.length) {
    return `every ${interval} ${interval > 1 ? 'weeks' : 'week'} on ${byDay.join(', ')}`;
  }

  const u = unitLabel(unit);
  if (!u) return '';

  return `every ${interval} ${u}`;
}
