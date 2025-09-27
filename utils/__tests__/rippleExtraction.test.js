import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractTasks, extractRipplesFromEntry } from '../rippleExtractor.js';
import { sieveRipples } from '../rippleSieve.js';

const ENTRY_DATE = '2024-06-10'; // Monday

test('extractTasks handles "remember to" with "this Friday"', () => {
  const text = 'Remember to send the slides this Friday.';
  const tasks = extractTasks(text, ENTRY_DATE);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].dueDate, '2024-06-14');
  assert.equal(tasks[0].text, 'send the slides this Friday');
});

test('extractTasks handles "be sure to" and "this weekend"', () => {
  const text = 'Be sure to water the plants this weekend.';
  const tasks = extractTasks(text, ENTRY_DATE);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].dueDate, '2024-06-15');
});

test('extractTasks handles "gotta" and "by next week"', () => {
  const text = 'Gotta renew the license by next week.';
  const tasks = extractTasks(text, ENTRY_DATE);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].dueDate, '2024-06-17');
  assert.equal(tasks[0].reason, 'deadline');
});

test('sieveRipples keeps actionable ripples derived from shared verbs', () => {
  const { ripples } = extractRipplesFromEntry({
    text: 'Remember to organize the garage this weekend.',
    entryDate: ENTRY_DATE,
  });
  const filtered = sieveRipples(ripples);
  assert.equal(filtered.length, ripples.length);
});
