import { test, expect } from 'vitest';

import suggestMetadata from '../suggestMetadata.js';

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
