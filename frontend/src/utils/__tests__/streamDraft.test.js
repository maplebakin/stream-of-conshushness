import { describe, expect, it } from 'vitest';
import {
  clearStreamDraft,
  draftIdentityAfterTextChange,
  readStreamDraft,
  streamDraftKey,
  writeStreamDraft,
} from '../streamDraft.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('Stream quick-entry draft persistence', () => {
  it('scopes persisted journal text to the signed-in user', () => {
    expect(streamDraftKey({ id: 'user-a' })).toBe('streamQuickEntryDraft:user-a');
    expect(streamDraftKey({ id: 'user-b' })).toBe('streamQuickEntryDraft:user-b');
    expect(streamDraftKey(null)).toBe('');
  });

  it('round-trips the request identity needed to retry an uncertain save', () => {
    const storage = memoryStorage();
    const key = streamDraftKey({ id: 'user-a' });
    const draft = {
      text: 'Call the dentist tomorrow',
      date: '2026-07-13',
      clientRequestId: 'request-1',
      submittedText: 'Call the dentist tomorrow',
    };

    expect(writeStreamDraft(storage, key, draft)).toBe(true);
    expect(readStreamDraft(storage, key)).toEqual(draft);
    expect(clearStreamDraft(storage, key)).toBe(true);
    expect(readStreamDraft(storage, key)).toBeNull();
  });

  it('keeps an id for an exact retry and rotates it when the attempted payload changes', () => {
    const retry = draftIdentityAfterTextChange({
      clientRequestId: 'request-1',
      submittedText: 'Original thought',
      nextText: 'Original thought',
      createId: () => 'request-2',
    });
    expect(retry).toEqual({ clientRequestId: 'request-1', submittedText: 'Original thought' });

    const edited = draftIdentityAfterTextChange({
      clientRequestId: 'request-1',
      submittedText: 'Original thought',
      nextText: 'A revised thought',
      createId: () => 'request-2',
    });
    expect(edited).toEqual({ clientRequestId: 'request-2', submittedText: '' });
  });
});
