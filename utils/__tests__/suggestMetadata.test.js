import { test, expect } from 'vitest';

import suggestMetadata from '../suggestMetadata.js';
import analyzeEntry from '../analyzeEntry.js';

test('suggestMetadata keeps intentional tags and drops non-tag bracket values', () => {
  const res = suggestMetadata('Prep #Focus and {routine} [2025-08-30] [the]');
  expect(res.tags).toEqual(['focus', 'routine']);
});

test('suggestMetadata extracts appointment timing with a cleaner title', () => {
  const baseDate = new Date('2026-02-08T12:00:00Z');
  const res = suggestMetadata('Call the dentist tomorrow at 3pm.', baseDate);
  expect(res.when.length).toBe(1);
  expect(res.when[0].timeStart).toBe('15:00');
  expect(res.when[0].title).toMatch(/call the dentist/i);
  expect(res.when[0].title).not.toMatch(/tomorrow|3pm/i);
});

test('suggestMetadata cluster detection stays conservative for short text', () => {
  const lowSignal = suggestMetadata('laundry');
  const highSignal = suggestMetadata('Laundry, dishes, and a kitchen reset tonight.');

  expect(lowSignal.clusters.includes('home')).toBe(false);
  expect(highSignal.clusters.includes('home')).toBe(true);
});

test('suggestMetadata confidence increases with stronger explicit signals', () => {
  const vague = suggestMetadata('maybe later');
  const rich = suggestMetadata('Urgent #priority: call the doctor tomorrow at 9am for medication refill.');

  expect(rich.confidence).toBeGreaterThan(vague.confidence);
});

test('analyzeEntry does not turn task-like dated actions into important events', () => {
  const baseDate = new Date('2026-06-08T12:00:00Z');
  const cases = [
    'pay the daycare fees by the end of the day today',
    'I really need to tidy up the apartment today; grab a couple of garbage bags and just go at',
    'I need to remember to extend the pause on my Audible subscription in two months.',
    'I should book a doctor appointment tomorrow.',
  ];

  for (const text of cases) {
    const res = analyzeEntry({ text, baseDate });
    expect(res.importantEvents).toEqual([]);
    expect(res.appointments).toEqual([]);
  }
});
