// utils/rruleHumanize.js
const ORD = { 1:'first', 2:'second', 3:'third', 4:'fourth', '-1':'last' };

export function humanizeRRULE(rrule) {
  if (!rrule) return '';
  const m = Object.fromEntries(rrule.split(';').map(kv => kv.split('=')));
  const F = m.FREQ, I = m.INTERVAL ? parseInt(m.INTERVAL,10) : 1;
  const byday = m.BYDAY ? m.BYDAY.split(',') : [];
  const bymd  = m.BYMONTHDAY ? parseInt(m.BYMONTHDAY,10) : null;
  const bset  = m.BYSETPOS ? parseInt(m.BYSETPOS,10) : null;
  const bmon  = m.BYMONTH ? parseInt(m.BYMONTH,10) : null;

  if (F === 'DAILY') return I===1 ? 'Every day' : `Every ${I} days`;
  if (F === 'WEEKLY') {
    const days = byday.length ? byday.join(', ') : 'week';
    return I===1 ? `Every ${days}` : `Every ${I} weeks on ${days}`;
  }
  if (F === 'MONTHLY') {
    if (bmd) return I===1 ? `Every month on the ${bmd}` : `Every ${I} months on the ${bmd}`;
    if (bset && byday.length===1) return I===1 ? `Every ${ORD[bset] || `#${bset}`} ${byday[0]}` : `Every ${I} months on the ${ORD[bset] || `#${bset}`} ${byday[0]}`;
    return I===1 ? 'Every month' : `Every ${I} months`;
  }
  if (F === 'YEARLY') {
    if (bmon && bymd) return `Every year on ${bmon}/${bymd}`;
    return I===1 ? 'Every year' : `Every ${I} years`;
  }
  return rrule;
}

// handy quick-picks -> RRULE
export const RRULE_PRESETS = {
  daily: 'FREQ=DAILY',
  everyOtherDay: 'FREQ=DAILY;INTERVAL=2',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekends: 'FREQ=WEEKLY;BYDAY=SA,SU',
  wednesday: 'FREQ=WEEKLY;BYDAY=WE',
};
