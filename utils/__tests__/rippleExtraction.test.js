import { test, expect } from 'vitest';

import { extractTasks, extractRipplesFromEntry } from '../rippleExtractor.js';
import { sieveRipples } from '../rippleSieve.js';

const ENTRY_DATE = '2024-06-10'; // Monday

test('extractTasks handles "remember to" with "this Friday"', () => {
  const text = 'Remember to send the slides this Friday.';
  const tasks = extractTasks(text, ENTRY_DATE);
  expect(tasks.length).toBe(1);
  expect(tasks[0].dueDate).toBe('2024-06-14');
  expect(tasks[0].text).toBe('send the slides this Friday');
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

test('sieveRipples keeps actionable ripples derived from shared verbs', () => {
  const { ripples } = extractRipplesFromEntry({
    text: 'Remember to organize the garage this weekend.',
    entryDate: ENTRY_DATE,
  });
  const filtered = sieveRipples(ripples);
  expect(filtered.length).toBe(ripples.length);
});
