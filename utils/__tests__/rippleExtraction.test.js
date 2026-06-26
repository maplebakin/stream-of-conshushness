import { test, expect } from 'vitest';

import { extractTasks, extractRipplesFromEntry } from '../rippleExtractor.js';
import { sieveRipples } from '../rippleSieve.js';

const ENTRY_DATE = '2024-06-10'; // Monday

test('extractTasks handles "remember to" with "this Friday"', () => {
  const text = 'Remember to send the slides this Friday.';
  const tasks = extractTasks(text, ENTRY_DATE);
  expect(tasks.length).toBe(1);
  expect(tasks[0].dueDate).toBe('2024-06-14');
  expect(tasks[0].text).toBe('Send the slides');
});

test('extractTasks handles "be sure to" and "this weekend"', () => {
  const text = 'Be sure to water the plants this weekend.';
  const tasks = extractTasks(text, ENTRY_DATE);
  expect(tasks.length).toBe(1);
  expect(tasks[0].dueDate).toBe('2024-06-15');
});

test('extractTasks handles "gotta" and "by next week"', () => {
  const text = 'Gotta renew the license by next week.';
  const tasks = extractTasks(text, ENTRY_DATE);
  expect(tasks.length).toBe(1);
  expect(tasks[0].dueDate).toBe('2024-06-17');
  expect(tasks[0].reason).toBe('deadline');
});

test('extractTasks resolves tomorrow from the entry date', () => {
  const tasks = extractTasks('I need to call the dentist tomorrow.', '2026-06-08');
  expect(tasks.length).toBe(1);
  expect(tasks[0]).toMatchObject({
    text: 'Call the dentist',
    dueDate: '2026-06-09',
  });
});

test('extractTasks resolves tomorrow across Toronto DST boundaries', () => {
  expect(extractTasks('I need to call the dentist tomorrow.', '2026-03-07')[0].dueDate).toBe('2026-03-08');
  expect(extractTasks('I need to call the dentist tomorrow.', '2026-10-31')[0].dueDate).toBe('2026-11-01');
});

test('sieveRipples keeps actionable ripples derived from shared verbs', () => {
  const { ripples } = extractRipplesFromEntry({
    text: 'Remember to organize the garage this weekend.',
    entryDate: ENTRY_DATE,
  });
  const filtered = sieveRipples(ripples);
  expect(filtered.length).toBe(ripples.length);
});

test('extractTasks cleans task titles while preserving due metadata', () => {
  const cases = [
    ['I really gotta finish folding the laundry', 'Finish folding the laundry', null],
    ['pay the daycare fees by the end of the day today', 'Pay daycare fees', ENTRY_DATE],
    ['I need to remember to extend the pause on my Audible subscription in two months.', 'Extend the pause on my Audible subscription', '2024-08-10'],
    ['remember to clean the fish tank every other day', 'Clean the fish tank', null],
    ['I really need to tidy up the apartment today; grab a couple of garbage bags and just go at', 'Tidy up the apartment', ENTRY_DATE],
  ];

  for (const [text, title, dueDate] of cases) {
    const tasks = extractTasks(text, ENTRY_DATE);
    expect(tasks[0]).toMatchObject({ text: title });
    if (dueDate) expect(tasks[0].dueDate).toBe(dueDate);
  }
});

test('extractTasks keeps short imperatives entry-only without clear due context', () => {
  expect(extractTasks('pick up iron', ENTRY_DATE)).toEqual([]);
});

test('extractRipples marks dated non-recurring actions with due metadata only', () => {
  const due = extractRipplesFromEntry({
    text: 'pay the daycare fees by the end of the day today',
    entryDate: ENTRY_DATE,
  }).ripples[0];
  const recurring = extractRipplesFromEntry({
    text: 'remember to clean the fish tank every other day',
    entryDate: ENTRY_DATE,
  }).ripples[0];

  expect(due).toMatchObject({
    type: 'deadline',
    extractedText: 'Pay daycare fees',
    meta: { dueDate: ENTRY_DATE, autoCreate: true },
  });
  expect(recurring).toMatchObject({
    type: 'recurringTask',
    extractedText: 'Clean the fish tank',
    meta: { recurrence: 'FREQ=DAILY;INTERVAL=2' },
  });
  expect(recurring.meta.autoCreate).toBeUndefined();
});
