// frontend/src/api/tasksAdapter.js

/** Toronto-safe YYYY-MM-DD for a given Date (or now). */
export function isoInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${day}`;
}

/** Add N days to an ISO date in Toronto timezone. */
export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); // anchor in UTC, we'll format back to Toronto
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return isoInToronto(dt);
}

/** POST /api/tasks/carry-forward with JSON body.
 *  opts: { smart:boolean|1, includeNoDate:boolean|1 }
 *  cluster: optional string
 */
export async function carryForward({ token, from, to, cluster = null, opts = {} }) {
  if (!from || !to) throw new Error('carryForward requires { from, to }');

  const body = {
    from,
    to,
    ...(cluster ? { cluster } : {}),
    ...(opts.smart ? { smart: 1 } : {}),
    ...(opts.includeNoDate ? { includeNoDate: 1 } : {})
  };

  const res = await fetch('/api/tasks/carry-forward', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
    throw new Error(`carry-forward failed: ${res.status} ${res.statusText} ${detail}`);
  }
  return res.json();
}

/** Convenience: move all incomplete tasks from current view date to the next day. */
export async function carryForwardDay({ token, viewISO, cluster = null, smart = true, includeNoDate = false }) {
  const from = viewISO || isoInToronto();
  const to = addDaysISO(from, 1);
  return carryForward({ token, from, to, cluster, opts: { smart, includeNoDate } });
}
