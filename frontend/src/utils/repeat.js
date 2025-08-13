// frontend/src/utils/repeat.js
export function describeRepeat(repeat) {
  if (!repeat) return '';
  if (typeof repeat === 'string') return repeat; // legacy strings like "daily"

  const { unit, interval = 1, byDay } = repeat;
  const n = Number(interval) || 1;
  const every = n === 1 ? 'Every' : `Every ${n}`;

  if (unit === 'day') return `${every} day${n > 1 ? 's' : ''}`;

  if (unit === 'week') {
    if (Array.isArray(byDay) && byDay.length) {
      const names = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
      const days = byDay.map(d => names[d] || d).join(', ');
      return `${every} week${n > 1 ? 's' : ''} on ${days}`;
    }
    return `${every} week${n > 1 ? 's' : ''}`;
  }

  if (unit === 'month') return `${every} month${n > 1 ? 's' : ''}`;
  return 'Repeats';
}
