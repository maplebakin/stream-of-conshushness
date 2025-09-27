import { test } from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../entryAutomation.js';

const { buildSuggestedTasks, normalizeOptionalString } = __testables;

const BASE_DATE = '2024-06-10';

const normalizeCases = [
  ['alpha', 'alpha'],
  ['  padded  ', 'padded'],
  ['   ', ''],
  [42, ''],
  [null, ''],
  [undefined, ''],
];

test('normalizeOptionalString trims strings and clears non-strings', () => {
  for (const [input, expected] of normalizeCases) {
    assert.equal(normalizeOptionalString(input), expected);
  }
});

test('buildSuggestedTasks tolerates missing options', () => {
  assert.deepEqual(buildSuggestedTasks(), []);
  assert.deepEqual(buildSuggestedTasks(null), []);
  assert.deepEqual(buildSuggestedTasks({}), []);
});

test('buildSuggestedTasks preserves provided cluster and section', () => {
  const tasks = buildSuggestedTasks({
    text: 'Remember to call the doctor tomorrow.',
    date: BASE_DATE,
    cluster: 'health',
    section: 'wellness',
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].cluster, 'health');
  assert.equal(tasks[0].section, 'wellness');
});

test('buildSuggestedTasks normalizes non-string cluster and section values', () => {
  const tasks = buildSuggestedTasks({
    text: 'Remember to renew the passport tomorrow.',
    date: BASE_DATE,
    cluster: { key: 'travel' },
    section: 99,
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].cluster, '');
  assert.equal(tasks[0].section, '');
});
