import { test, expect } from 'vitest';

import { __testables } from '../entryAutomation.js';

const { buildSuggestedTasks, normalizeOptionalString } = __testables;

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
