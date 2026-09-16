function parseRRule(rrule = '') {
  const out = {};
  for (const part of String(rrule || '').split(';')) {
    const [key, value] = part.split('=');
    if (key) out[key.toUpperCase()] = value || '';
  }
  return out;
}

export function initialAppointmentRepeat(appointment) {
  const parsed = parseRRule(appointment?.rrule || '');
  return {
    repeatOn: Boolean(parsed.FREQ),
    freq: parsed.FREQ || 'WEEKLY',
    interval: Number.parseInt(parsed.INTERVAL || '1', 10) || 1,
    // An omitted BYDAY intentionally means "the DTSTART weekday". Do not
    // silently turn an existing Wednesday series into Monday when editing it.
    byday: parsed.BYDAY ? parsed.BYDAY.split(',').filter(Boolean) : [],
    until: appointment?.until || parsed.UNTIL || '',
  };
}

export function appointmentValidationError({
  title,
  date,
  repeatOn,
  startDate,
  until,
  timeStart,
  timeEnd,
}) {
  if (!String(title || '').trim()) return 'Title is required.';
  if (repeatOn && !startDate) return 'Start date is required for a repeating appointment.';
  if (!repeatOn && !date) return 'Date is required.';
  if (repeatOn && until && until < startDate) return 'Until date must be on or after the start date.';
  if (timeStart && timeEnd && timeEnd < timeStart) return 'End time must not be earlier than start time.';
  return '';
}

export default initialAppointmentRepeat;
