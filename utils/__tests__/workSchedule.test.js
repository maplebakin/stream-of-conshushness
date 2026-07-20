import { describe, expect, it } from 'vitest';
import {
  parseWorkSchedule,
  reconcileWorkSchedule,
  resolveShiftTime,
} from '../workSchedule.js';

const anchor = '2026-07-19';

describe('work schedule parsing', () => {
  it('extracts several weekday shifts as one upcoming schedule', () => {
    const parsed = parseWorkSchedule(
      'My schedule was released. I work Monday 10–3, Wednesday 12–8, and Friday 7:50–1:50.',
      anchor
    );

    expect(parsed).toMatchObject({
      label: 'Work',
      mode: 'capture',
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
    });
    expect(parsed.shifts).toMatchObject([
      { date: '2026-07-20', start: '10:00', end: '15:00' },
      { date: '2026-07-22', start: '12:00', end: '20:00' },
      { date: '2026-07-24', start: '07:50', end: '13:50' },
    ]);
  });

  it('resolves next week and mixed informal time formats', () => {
    const parsed = parseWorkSchedule(
      'Next week I work Monday from 10:50 to 7:30, Tuesday 3:30–7:30, and Sunday 11–6.',
      '2026-07-15'
    );
    expect(parsed.shifts).toMatchObject([
      { date: '2026-07-20', start: '10:50', end: '19:30' },
      { date: '2026-07-21', start: '15:30', end: '19:30' },
      { date: '2026-07-26', start: '11:00', end: '18:00' },
    ]);
  });

  it('resolves explicit ordinal dates from the entry date', () => {
    const parsed = parseWorkSchedule(
      'My shifts are the 21st 10–3, the 23rd noon–8, and the 25th 7:50am–1:50pm.',
      anchor
    );
    expect(parsed.shifts).toMatchObject([
      { date: '2026-07-21', start: '10:00', end: '15:00' },
      { date: '2026-07-23', start: '12:00', end: '20:00' },
      { date: '2026-07-25', start: '07:50', end: '13:50', ambiguous: false },
    ]);
  });

  it('surfaces inferred AM/PM and rejects implausible durations', () => {
    expect(resolveShiftTime('10', '3')).toMatchObject({
      valid: true,
      start: '10:00',
      end: '15:00',
      ambiguous: true,
    });
    expect(resolveShiftTime('11pm', '10pm')).toMatchObject({
      valid: false,
      ambiguous: true,
    });
  });

  it('preserves a confidently stated workplace as the shift location', () => {
    const parsed = parseWorkSchedule(
      'My schedule is out. I work at North Market Monday 10–3 and Friday 11–6.',
      anchor
    );
    expect(parsed.shifts).toHaveLength(2);
    expect(parsed.shifts.every((shift) => shift.location === 'North Market')).toBe(true);
  });
});

describe('work schedule reconciliation', () => {
  const prior = [
    {
      _id: 'monday',
      title: 'Work',
      scheduleLabel: 'Work',
      scheduleStatus: 'active',
      date: '2026-07-20',
      timeStart: '10:00',
      timeEnd: '15:00',
    },
    {
      _id: 'wednesday',
      title: 'Work',
      scheduleLabel: 'Work',
      scheduleStatus: 'active',
      date: '2026-07-22',
      timeStart: '12:00',
      timeEnd: '20:00',
    },
    {
      _id: 'friday',
      title: 'Work',
      scheduleLabel: 'Work',
      scheduleStatus: 'active',
      date: '2026-07-24',
      timeStart: '07:50',
      timeEnd: '13:50',
    },
  ];

  it('proposes one removal and one addition for a day replacement', () => {
    const parsed = parseWorkSchedule(
      'Schedule updated. I don’t work Wednesday anymore. It’s Thursday 11–7:30 now.',
      anchor
    );
    const changes = reconcileWorkSchedule(parsed, prior);
    expect(changes).toMatchObject([
      { action: 'remove', targetAppointmentId: 'wednesday', selected: true },
      { action: 'add', date: '2026-07-23', start: '11:00', end: '19:30' },
    ]);
  });

  it('proposes a time change against the matching prior shift', () => {
    const parsed = parseWorkSchedule(
      'They changed my Friday shift from 7:50–1:50 to 10–3.',
      anchor
    );
    expect(reconcileWorkSchedule(parsed, prior)).toMatchObject([
      {
        action: 'change',
        targetAppointmentId: 'friday',
        previous: { start: '07:50', end: '13:50' },
        start: '10:00',
        end: '15:00',
      },
    ]);
  });

  it('proposes an explicit move and carries forward the prior time', () => {
    const sunday = {
      ...prior[0],
      _id: 'sunday',
      date: '2026-07-26',
      timeStart: '11:00',
      timeEnd: '18:00',
    };
    const parsed = parseWorkSchedule('Move my Sunday shift to Saturday, same time.', anchor);
    expect(reconcileWorkSchedule(parsed, [sunday])).toMatchObject([
      {
        action: 'move',
        targetAppointmentId: 'sunday',
        date: '2026-07-25',
        start: '11:00',
        end: '18:00',
      },
    ]);
  });

  it('removes unmatched prior shifts when a new schedule replaces the old one', () => {
    const parsed = parseWorkSchedule(
      'My new schedule replaces the old one: Monday 10–3 and Thursday 12–8.',
      anchor
    );
    const changes = reconcileWorkSchedule(parsed, prior);
    expect(changes.some((change) => change.action === 'remove' && change.targetAppointmentId === 'wednesday')).toBe(true);
    expect(changes.some((change) => change.action === 'remove' && change.targetAppointmentId === 'friday')).toBe(true);
    expect(changes.some((change) => change.action === 'add' && change.date === '2026-07-23')).toBe(true);
  });

  it('does not compare against unrelated appointments', () => {
    const parsed = parseWorkSchedule('I’m no longer working Tuesday.', anchor);
    const changes = reconcileWorkSchedule(parsed, [
      {
        _id: 'dentist',
        title: 'Dentist',
        date: '2026-07-21',
        timeStart: '15:00',
        timeEnd: '16:00',
      },
    ]);
    expect(changes[0]).toMatchObject({
      action: 'remove',
      targetAppointmentId: null,
      selected: false,
      ambiguous: true,
    });
  });

  it('requires choosing when multiple prior shifts match', () => {
    const parsed = parseWorkSchedule('I’m no longer working Tuesday.', anchor);
    const candidates = ['a', 'b'].map((_value, index) => ({
      ...prior[0],
      _id: `tuesday-${index}`,
      date: '2026-07-21',
      timeStart: index ? '18:00' : '09:00',
      timeEnd: index ? '22:00' : '13:00',
    }));
    const [change] = reconcileWorkSchedule(parsed, candidates);
    expect(change).toMatchObject({
      action: 'remove',
      selected: false,
      ambiguous: true,
      candidateAppointmentIds: ['tuesday-0', 'tuesday-1'],
    });
  });
});
