import { test, expect } from 'vitest';

import { __testables } from '../entryAutomation.js';

const {
  buildSuggestedTasks,
  normalizeOptionalString,
  normalizedAutomationInputs,
  affectedAutomationDomains,
  normalizeEntryForUpdate,
} = __testables;

const BASE_DATE = '2024-06-10';

// Unified cases from both branches
const normalizeCases = [
  ['alpha', 'alpha'],
  ['  padded  ', 'padded'],
  ['', ''],
  ['   ', ''],
  [42, ''],
  [null, ''],
  [undefined, ''],
];

test('normalizeOptionalString trims strings and clears non-strings', () => {
  for (const [input, expected] of normalizeCases) {
    expect(normalizeOptionalString(input)).toBe(expected);
  }
});

test('buildSuggestedTasks tolerates missing options', () => {
  expect(buildSuggestedTasks()).toEqual([]);
  expect(buildSuggestedTasks(null)).toEqual([]);
  expect(buildSuggestedTasks({})).toEqual([]);
});

test('buildSuggestedTasks preserves provided cluster and section', () => {
  const tasks = buildSuggestedTasks({
    text: 'Remember to call the doctor tomorrow.',
    date: BASE_DATE,
    cluster: 'health',
    section: 'wellness',
  });

  expect(tasks.length).toBe(1);
  expect(tasks[0].cluster).toBe('health');
  expect(tasks[0].section).toBe('wellness');
});

test('buildSuggestedTasks normalizes non-string cluster and section values', () => {
  const tasks = buildSuggestedTasks({
    text: 'Remember to renew the passport tomorrow.',
    date: BASE_DATE,
    cluster: { key: 'travel' },
    section: 99,
  });

  expect(tasks.length).toBe(1);
  expect(tasks[0].cluster).toBe('');
  expect(tasks[0].section).toBe('');
});

test('normalizes only persisted automation inputs', () => {
  expect(normalizedAutomationInputs({
    text: '  Call the dentist tomorrow.  ',
    date: '2026-06-08',
    mood: 'anxious',
    tags: ['health'],
    pinned: true,
    cluster: 'Health',
    section: 'Appointments',
  })).toEqual({
    text: 'Call the dentist tomorrow.',
    date: '2026-06-08',
  });
});

test('calculates automation domains from their actual extractor inputs', () => {
  const previous = { text: 'I need to call the dentist tomorrow.', date: '2026-06-08' };

  expect(affectedAutomationDomains(previous, {
    ...previous,
    mood: 'focused',
    tags: ['health'],
    pinned: true,
    cluster: 'Health',
    section: 'Appointments',
  })).toMatchObject({
    textChanged: false,
    dateChanged: false,
    calendar: false,
    tasks: false,
    ripples: false,
    gather: false,
    interests: false,
  });

  expect(affectedAutomationDomains(previous, {
    ...previous,
    date: '2026-06-09',
  })).toMatchObject({
    textChanged: false,
    dateChanged: true,
    calendar: true,
    tasks: true,
    ripples: true,
    gather: false,
    interests: false,
  });

  expect(affectedAutomationDomains(previous, {
    ...previous,
    text: 'I need to email the school tomorrow.',
  })).toMatchObject({
    textChanged: true,
    dateChanged: false,
    calendar: true,
    tasks: true,
    ripples: true,
    gather: true,
    interests: true,
  });
});

test('content and html-only updates replace stale persisted plain text', () => {
  const existing = {
    text: 'Old private thought',
    html: '<p>Old private thought</p>',
    content: '<p>Old private thought</p>',
  };

  expect(normalizeEntryForUpdate({ content: '<p>New content thought</p>' }, existing)).toMatchObject({
    text: 'New content thought',
    html: '<p>New content thought</p>',
    content: '<p>New content thought</p>',
  });
  expect(normalizeEntryForUpdate({ html: '<p>New html thought</p>' }, existing)).toMatchObject({
    text: 'New html thought',
    html: '<p>New html thought</p>',
    content: '<p>New html thought</p>',
  });
});
