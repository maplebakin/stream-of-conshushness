const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_INDEX = new Map(DAY_NAMES.map((name, index) => [name.toLowerCase(), index]));
const DAY_PATTERN = '(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)';
const CLOCK_PATTERN = '(noon|\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)';
const RANGE_PATTERN = `${CLOCK_PATTERN}\\s*(?:[–—-]|\\bto\\b)\\s*${CLOCK_PATTERN}`;

function isoAtUTCNoon(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addScheduleDays(value, amount) {
  const date = isoAtUTCNoon(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function mondayOfWeek(anchor) {
  const date = isoAtUTCNoon(anchor);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function weekdayDate(anchor, weekday, { nextWeek = false, forceUpcomingWeek = false } = {}) {
  const anchorDate = isoAtUTCNoon(anchor);
  const target = DAY_INDEX.get(String(weekday || '').toLowerCase());
  if (!anchorDate || target == null) return '';

  const anchorDay = anchorDate.getUTCDay();
  let weekMonday = mondayOfWeek(anchor);
  if (nextWeek || forceUpcomingWeek) weekMonday = addScheduleDays(weekMonday, 7);
  const offset = target === 0 ? 6 : target - 1;
  let resolved = addScheduleDays(weekMonday, offset);
  if (!nextWeek && !forceUpcomingWeek && resolved < anchor) {
    resolved = addScheduleDays(resolved, 7);
  }
  // A schedule released on Sunday conventionally describes the week beginning
  // the following day, rather than the week that has just ended.
  if (!nextWeek && anchorDay === 0 && resolved === anchor) {
    resolved = addScheduleDays(resolved, 7);
  }
  return resolved;
}

function ordinalDate(anchor, dayNumber) {
  const date = isoAtUTCNoon(anchor);
  const day = Number(dayNumber);
  if (!date || day < 1 || day > 31) return '';

  for (let monthOffset = 0; monthOffset <= 12; monthOffset += 1) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + monthOffset;
    const candidate = new Date(Date.UTC(year, month, day, 12));
    if (candidate.getUTCDate() !== day) continue;
    const iso = candidate.toISOString().slice(0, 10);
    if (iso >= anchor) return iso;
  }
  return '';
}

function clockToken(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\./g, '');
  if (raw === 'noon') return { hour: 12, minute: 0, meridiem: 'pm', explicit: true };
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  return { hour, minute, meridiem: match[3] || '', explicit: !!match[3] };
}

function minutesFor(token, meridiem) {
  let hour = token.hour % 12;
  if (meridiem === 'pm') hour += 12;
  return hour * 60 + token.minute;
}

function hhmm(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function resolveShiftTime(startValue, endValue) {
  const startToken = clockToken(startValue);
  const endToken = clockToken(endValue);
  if (!startToken || !endToken) {
    return { valid: false, ambiguous: true, warnings: ['Check the shift times.'] };
  }

  let start;
  let end;
  if (startToken.meridiem) {
    start = minutesFor(startToken, startToken.meridiem);
  } else if ((startToken.hour >= 1 && startToken.hour <= 6) || startToken.hour === 12) {
    start = minutesFor(startToken, 'pm');
  } else {
    start = minutesFor(startToken, 'am');
  }

  if (endToken.meridiem) {
    end = minutesFor(endToken, endToken.meridiem);
  } else {
    end = minutesFor(endToken, 'am');
    while (end <= start && end + 12 * 60 <= 24 * 60) end += 12 * 60;
  }

  if (!startToken.meridiem && endToken.meridiem) {
    const morningStart = minutesFor(startToken, 'am');
    const afternoonStart = minutesFor(startToken, 'pm');
    start = morningStart < end && end - morningStart <= 16 * 60 ? morningStart : afternoonStart;
  }
  if (startToken.meridiem && !endToken.meridiem) {
    end = minutesFor(endToken, 'am');
    while (end <= start && end + 12 * 60 <= 24 * 60) end += 12 * 60;
  }

  const duration = end - start;
  if (start < 0 || start >= 24 * 60 || end > 24 * 60 || duration <= 0 || duration > 16 * 60) {
    return {
      valid: false,
      ambiguous: true,
      warnings: ['The shift could be overnight or have an implausible duration. Check both times.'],
    };
  }

  const inferred = !startToken.explicit || !endToken.explicit;
  return {
    valid: true,
    start: hhmm(start),
    end: hhmm(end),
    ambiguous: inferred,
    confidence: inferred ? 0.78 : 0.98,
    warnings: inferred ? ['AM/PM was inferred from a typical daytime work shift.'] : [],
  };
}

function dateForDescriptor(anchor, descriptor, options) {
  if (/^\d+$/.test(String(descriptor))) return ordinalDate(anchor, Number(descriptor));
  return weekdayDate(anchor, descriptor, options);
}

function schedulePeriod(dates, fallbackAnchor) {
  const valid = dates.filter(Boolean).sort();
  if (valid.length) {
    const first = valid[0];
    const last = valid[valid.length - 1];
    const firstMonday = mondayOfWeek(first);
    const lastMonday = mondayOfWeek(last);
    return {
      start: firstMonday,
      end: addScheduleDays(lastMonday, 6),
    };
  }
  const monday = mondayOfWeek(fallbackAnchor);
  return { start: monday, end: addScheduleDays(monday, 6) };
}

function shiftKey(shift, index) {
  return `${shift.date || shift.weekday || 'shift'}:${shift.start || 'time'}:${index}`;
}

function scheduleIntent(text) {
  return /\b(?:schedule|shifts?|work(?:ing)?)\b/i.test(text);
}

function isUpdateText(text) {
  return /\b(?:updated?|changed?|no longer|don'?t work|not working|move|replaces?|new schedule)\b/i.test(text);
}

export function parseWorkSchedule(text, entryDate) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || !isoAtUTCNoon(entryDate) || !scheduleIntent(raw)) return null;

  const lower = raw.toLowerCase();
  const nextWeek = /\bnext week\b/i.test(raw);
  const weekdayMatches = [...raw.matchAll(new RegExp(DAY_PATTERN, 'gi'))];
  const anchorDay = isoAtUTCNoon(entryDate).getUTCDay();
  const forceUpcomingWeek = !nextWeek && (
    anchorDay === 0 ||
    weekdayMatches.some((match) => DAY_INDEX.get(match[1].toLowerCase()) < anchorDay)
  );
  const dateOptions = { nextWeek, forceUpcomingWeek };
  const workplaceMatch = raw.match(
    new RegExp(`\\bwork(?:ing)?\\s+at\\s+(.+?)(?=\\s+(?:${DAY_PATTERN}|next week|on\\s+${DAY_PATTERN})\\b|[,.;])`, 'i')
  );
  const location = String(workplaceMatch?.[1] || '').trim();
  const shifts = [];
  const directives = [];
  const consumedRanges = [];

  const changePattern = new RegExp(
    `(?:changed?|change)\\b[^.]*?${DAY_PATTERN}\\s+(?:shift\\s+)?from\\s+${RANGE_PATTERN}\\s+to\\s+${RANGE_PATTERN}`,
    'gi'
  );
  for (const match of raw.matchAll(changePattern)) {
    const [, weekday, oldStart, oldEnd, newStart, newEnd] = match;
    const previousTime = resolveShiftTime(oldStart, oldEnd);
    const nextTime = resolveShiftTime(newStart, newEnd);
    const date = weekdayDate(entryDate, weekday, dateOptions);
    directives.push({
      type: 'change',
      weekday,
      date,
      previousStart: previousTime.start || '',
      previousEnd: previousTime.end || '',
      start: nextTime.start || '',
      end: nextTime.end || '',
      ambiguous: !previousTime.valid || !nextTime.valid || previousTime.ambiguous || nextTime.ambiguous,
      warnings: [...(previousTime.warnings || []), ...(nextTime.warnings || [])],
      raw: match[0],
    });
    consumedRanges.push([match.index, match.index + match[0].length]);
  }

  const movePattern = new RegExp(
    `\\bmove\\s+(?:my\\s+)?${DAY_PATTERN}\\s+(?:shift\\s+)?to\\s+${DAY_PATTERN}(?:,?\\s*same time)?`,
    'gi'
  );
  for (const match of raw.matchAll(movePattern)) {
    const [, fromWeekday, toWeekday] = match;
    directives.push({
      type: 'move',
      weekday: fromWeekday,
      toWeekday,
      date: weekdayDate(entryDate, fromWeekday, dateOptions),
      toDate: weekdayDate(entryDate, toWeekday, dateOptions),
      sameTime: /same time/i.test(match[0]),
      raw: match[0],
    });
    consumedRanges.push([match.index, match.index + match[0].length]);
  }

  const removePattern = new RegExp(
    `(?:don[’']?t\\s+work|do\\s+not\\s+work|no\\s+longer\\s+(?:work|working)|not\\s+working)\\s+(?:on\\s+)?${DAY_PATTERN}(?:\\s+anymore)?`,
    'gi'
  );
  for (const match of raw.matchAll(removePattern)) {
    const weekday = match[1];
    directives.push({
      type: 'remove',
      weekday,
      date: weekdayDate(entryDate, weekday, dateOptions),
      raw: match[0],
    });
    consumedRanges.push([match.index, match.index + match[0].length]);
  }

  const dayOrOrdinal = `(?:${DAY_PATTERN}|(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th))`;
  const shiftPattern = new RegExp(
    `${dayOrOrdinal}\\s+(?:shift\\s+)?(?:is\\s+)?(?:from\\s+)?${RANGE_PATTERN}`,
    'gi'
  );
  for (const match of raw.matchAll(shiftPattern)) {
    if (consumedRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    const weekday = match[1] || '';
    const ordinal = match[2] || '';
    const time = resolveShiftTime(match[3], match[4]);
    const date = dateForDescriptor(entryDate, weekday || ordinal, dateOptions);
    if (!date) continue;
    shifts.push({
      weekday: weekday || DAY_NAMES[isoAtUTCNoon(date).getUTCDay()],
      date,
      start: time.start || '',
      end: time.end || '',
      title: 'Work',
      location,
      ambiguous: !time.valid || time.ambiguous,
      confidence: time.confidence || 0.45,
      warnings: time.warnings || [],
      raw: match[0],
    });
  }

  if (!shifts.length && !directives.length) return null;
  const period = schedulePeriod(
    [...shifts.map((shift) => shift.date), ...directives.flatMap((item) => [item.date, item.toDate])],
    entryDate
  );
  const replace = /\b(?:replaces? the old one|replace(?:s|d)? (?:my |the )?(?:old )?schedule|new schedule replaces)\b/i.test(raw);

  return {
    label: 'Work',
    mode: replace ? 'replace' : isUpdateText(lower) ? 'update' : 'capture',
    replace,
    periodStart: period.start,
    periodEnd: period.end,
    shifts: shifts.map((shift, index) => ({ ...shift, key: shiftKey(shift, index) })),
    directives,
    sourceText: raw,
  };
}

function appointmentId(item) {
  return String(item?._id || item?.id || '');
}

function weekdayOfDate(date) {
  return DAY_NAMES[isoAtUTCNoon(date)?.getUTCDay()] || '';
}

function priorCandidates(prior, directive) {
  const weekday = String(directive.weekday || '').toLowerCase();
  let candidates = prior.filter((item) => weekdayOfDate(item.date).toLowerCase() === weekday);
  if (directive.previousStart) {
    candidates = candidates.filter((item) => item.timeStart === directive.previousStart);
  }
  if (directive.previousEnd) {
    candidates = candidates.filter((item) => item.timeEnd === directive.previousEnd);
  }
  if (directive.date) {
    const exact = candidates.filter((item) => item.date === directive.date);
    if (exact.length) candidates = exact;
  }
  return candidates;
}

function destructiveChange({ action, directive, candidates, values = {} }) {
  const candidateIds = candidates.map(appointmentId).filter(Boolean);
  const target = candidates.length === 1 ? candidates[0] : null;
  const warnings = [...(directive.warnings || [])];
  if (candidates.length === 0) warnings.push(`No active ${directive.weekday} Work shift was found.`);
  if (candidates.length > 1) warnings.push(`More than one ${directive.weekday} Work shift could match. Choose the intended shift.`);
  return {
    key: `${action}:${directive.weekday}:${directive.date || 'unresolved'}`,
    action,
    selected: candidates.length === 1,
    targetAppointmentId: appointmentId(target) || null,
    candidateAppointmentIds: candidateIds,
    candidateAppointments: candidates.map((item) => ({
      id: appointmentId(item),
      date: item.date,
      start: item.timeStart || '',
      end: item.timeEnd || '',
    })),
    previous: target ? {
      date: target.date,
      start: target.timeStart || '',
      end: target.timeEnd || '',
    } : {
      date: directive.date || '',
      start: directive.previousStart || '',
      end: directive.previousEnd || '',
    },
    title: 'Work',
    ambiguous: candidates.length !== 1 || !!directive.ambiguous,
    warnings,
    ...values,
  };
}

export function reconcileWorkSchedule(parsed, priorAppointments = []) {
  if (!parsed) return [];
  const prior = (priorAppointments || []).filter((item) => (
    item &&
    item.scheduleStatus !== 'cancelled' &&
    String(item.scheduleLabel || item.title || '').toLowerCase() === parsed.label.toLowerCase()
  ));
  const changes = [];

  for (const directive of parsed.directives || []) {
    const candidates = priorCandidates(prior, directive);
    if (directive.type === 'remove') {
      changes.push(destructiveChange({ action: 'remove', directive, candidates }));
    } else if (directive.type === 'change') {
      changes.push(destructiveChange({
        action: 'change',
        directive,
        candidates,
        values: {
          date: directive.date,
          start: directive.start,
          end: directive.end,
        },
      }));
    } else if (directive.type === 'move') {
      const target = candidates.length === 1 ? candidates[0] : null;
      const sameTimeMissing = directive.sameTime && !target;
      changes.push(destructiveChange({
        action: 'move',
        directive: {
          ...directive,
          ambiguous: sameTimeMissing,
          warnings: sameTimeMissing ? ['“Same time” needs a single matching prior shift.'] : [],
        },
        candidates,
        values: {
          date: directive.toDate,
          start: target?.timeStart || '',
          end: target?.timeEnd || '',
        },
      }));
    }
  }

  const alreadyDirectedDates = new Set(
    changes.flatMap((change) => [change.date, change.previous?.date]).filter(Boolean)
  );
  for (const shift of parsed.shifts || []) {
    const exact = prior.find((item) => (
      item.date === shift.date &&
      item.timeStart === shift.start &&
      item.timeEnd === shift.end
    ));
    if (exact) continue;
    const sameDate = prior.filter((item) => item.date === shift.date);
    if (parsed.mode === 'update' && sameDate.length === 1 && !alreadyDirectedDates.has(shift.date)) {
      changes.push({
        key: `change:${shift.key}`,
        action: 'change',
        selected: true,
        targetAppointmentId: appointmentId(sameDate[0]),
        candidateAppointmentIds: [appointmentId(sameDate[0])],
        candidateAppointments: [],
        previous: {
          date: sameDate[0].date,
          start: sameDate[0].timeStart || '',
          end: sameDate[0].timeEnd || '',
        },
        date: shift.date,
        start: shift.start,
        end: shift.end,
        title: shift.title,
        location: shift.location,
        ambiguous: shift.ambiguous,
        warnings: shift.warnings,
      });
    } else {
      changes.push({
        key: `add:${shift.key}`,
        action: 'add',
        selected: true,
        targetAppointmentId: null,
        candidateAppointmentIds: [],
        candidateAppointments: [],
        previous: {},
        date: shift.date,
        start: shift.start,
        end: shift.end,
        title: shift.title,
        location: shift.location,
        ambiguous: shift.ambiguous,
        warnings: shift.warnings,
      });
    }
  }

  if (parsed.replace) {
    const replacementDates = new Set((parsed.shifts || []).map((shift) => shift.date));
    for (const item of prior) {
      if (item.date < parsed.periodStart || item.date > parsed.periodEnd) continue;
      if (replacementDates.has(item.date)) continue;
      if (changes.some((change) => change.targetAppointmentId === appointmentId(item))) continue;
      changes.push({
        key: `remove:replace:${appointmentId(item)}`,
        action: 'remove',
        selected: true,
        targetAppointmentId: appointmentId(item),
        candidateAppointmentIds: [appointmentId(item)],
        candidateAppointments: [],
        previous: { date: item.date, start: item.timeStart || '', end: item.timeEnd || '' },
        title: 'Work',
        ambiguous: false,
        warnings: [],
      });
    }
  }

  return changes;
}

export const __testables = {
  ordinalDate,
  weekdayDate,
  weekdayOfDate,
};
