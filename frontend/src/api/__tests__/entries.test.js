import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../axiosInstance.js', () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.delete,
  },
}));

import {
  createEntry,
  getEntriesByDate,
  getEntry,
  listEntries,
  listTrashedEntries,
  removeEntry,
  restoreEntry,
  updateEntry,
} from '../entries.js';

describe('entry api wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists trashed entries and restores an entry through the expected endpoints', async () => {
    mocks.get.mockResolvedValueOnce({ data: [{ _id: 'entry-1' }] });
    mocks.post.mockResolvedValueOnce({ data: { ok: true } });

    await expect(listTrashedEntries()).resolves.toEqual([{ _id: 'entry-1' }]);
    await expect(restoreEntry('entry-1')).resolves.toEqual({ ok: true });

    expect(mocks.get).toHaveBeenCalledWith('/api/entries/trash');
    expect(mocks.post).toHaveBeenCalledWith('/api/entries/entry-1/restore');
  });

  it('keeps the existing entry wrapper endpoints intact', async () => {
    mocks.get
      .mockResolvedValueOnce({ data: [{ _id: 'e1' }] })
      .mockResolvedValueOnce({ data: { _id: 'e2' } })
      .mockResolvedValueOnce({ data: [{ _id: 'e3' }] });
    mocks.post.mockResolvedValueOnce({ data: { _id: 'e4' } });
    mocks.patch.mockResolvedValueOnce({ data: { _id: 'e5' } });
    mocks.delete.mockResolvedValueOnce({ data: { ok: true } });

    await expect(listEntries({ date: '2026-06-30' })).resolves.toEqual([{ _id: 'e1' }]);
    await expect(getEntry('entry-2')).resolves.toEqual({ _id: 'e2' });
    await expect(getEntriesByDate('2026-06-30')).resolves.toEqual([{ _id: 'e3' }]);
    await expect(createEntry({ text: 'hello' })).resolves.toEqual({ _id: 'e4' });
    await expect(updateEntry('entry-5', { text: 'updated' })).resolves.toEqual({ _id: 'e5' });
    await expect(removeEntry('entry-6')).resolves.toEqual({ ok: true });

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/api/entries', { params: { date: '2026-06-30' } });
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/api/entries/entry-2');
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/api/entries/by-date/2026-06-30');
    expect(mocks.post).toHaveBeenCalledWith('/api/entries', { text: 'hello' });
    expect(mocks.patch).toHaveBeenCalledWith('/api/entries/entry-5', { text: 'updated' });
    expect(mocks.delete).toHaveBeenCalledWith('/api/entries/entry-6');
  });
});
