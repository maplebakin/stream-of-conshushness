import { describe, expect, it, vi } from 'vitest';
import {
  clearLocalNoteDraft,
  createSerialTaskQueue,
  loadLocalNoteDraft,
  noteNeedsSave,
  saveLocalNoteDraft,
} from '../noteDraft.js';

describe('daily note draft persistence', () => {
  it('recognizes changed content, including clearing a previously saved note', () => {
    expect(noteNeedsSave('new note', '')).toBe(true);
    expect(noteNeedsSave('', 'old note')).toBe(true);
    expect(noteNeedsSave('', '')).toBe(false);
    expect(noteNeedsSave('same', 'same')).toBe(false);
  });

  it('serializes saves so a later draft cannot be overwritten by an older request', async () => {
    const order = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const queue = createSerialTaskQueue();
    const first = vi.fn(async () => {
      order.push('first-start');
      await firstGate;
      order.push('first-end');
    });
    const second = vi.fn(async () => { order.push('second'); });

    const firstRun = queue(first);
    const secondRun = queue(second);
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    releaseFirst();
    await Promise.all([firstRun, secondRun]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('keeps a short-lived account-and-day scoped recovery draft', () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    expect(saveLocalNoteDraft(storage, 'user-a', '2026-07-13', 'newer note', 1000)).toBe(true);
    expect(loadLocalNoteDraft(storage, 'user-a', '2026-07-13', 2000)).toMatchObject({ content: 'newer note' });
    expect(loadLocalNoteDraft(storage, 'user-b', '2026-07-13', 2000)).toBe(null);
    clearLocalNoteDraft(storage, 'user-a', '2026-07-13');
    expect(loadLocalNoteDraft(storage, 'user-a', '2026-07-13', 2000)).toBe(null);
  });
});
