import { describe, expect, it } from 'vitest';
import {
  buildEntryUpdatePayload,
  clearEntryModalDraft,
  ENTRY_MODAL_DRAFT_TTL_MS,
  entryEditorBaseFingerprint,
  entryEditorInitialValues,
  entryModalDraftKey,
  plainEntryText,
  readEntryModalDraft,
  writeEntryModalDraft,
} from '../entryEditor.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('entry editor payloads', () => {
  it('recovers legacy rich content when the normalized text field is empty', () => {
    expect(plainEntryText({ text: '', content: '', html: '<p>Older <strong>entry</strong></p>' })).toBe('Older entry');
  });
  const initial = {
    date: '2026-07-13',
    text: 'Original thought',
    mood: 'focused',
    tags: 'idea, later',
  };

  it('preserves content and cluster fields during metadata-only edits', () => {
    const payload = buildEntryUpdatePayload(initial, {
      ...initial,
      mood: 'calm',
    });

    expect(payload).toEqual({ mood: 'calm' });
    expect(payload).not.toHaveProperty('text');
    expect(payload).not.toHaveProperty('html');
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('clusters');
    expect(payload).not.toHaveProperty('cluster');
  });

  it('replaces stale rich fields when plain text is deliberately changed', () => {
    expect(buildEntryUpdatePayload(initial, {
      ...initial,
      text: 'Revised thought',
    })).toEqual({
      text: 'Revised thought',
      html: '',
      content: '',
    });
  });

  it('normalizes edited tags without treating display spacing as a change', () => {
    expect(buildEntryUpdatePayload(initial, { ...initial, tags: 'idea,later' })).toEqual({});
    expect(buildEntryUpdatePayload(initial, { ...initial, tags: 'idea, soon' })).toEqual({
      tags: ['idea', 'soon'],
    });
  });

  it('recovers readable text from a legacy HTML-only entry', () => {
    expect(plainEntryText({ html: '<p>First<br>second</p>' })).toBe('First\nsecond');
    expect(entryEditorInitialValues({
      initialEntry: { date: '2026-07-12', text: 'Keep me', tags: ['one'] },
    })).toEqual({
      date: '2026-07-12',
      text: 'Keep me',
      mood: '',
      tags: 'one',
    });
  });
});

describe('entry modal draft recovery', () => {
  const baseValues = {
    date: '2026-07-13',
    text: 'Original thought',
    mood: 'focused',
    tags: 'idea, later',
  };
  const initialEntry = {
    _id: 'entry-1',
    updatedAt: '2026-07-13T12:00:00.000Z',
  };
  const baseFingerprint = entryEditorBaseFingerprint(initialEntry, baseValues);

  it('scopes edit and new-entry drafts to both account and subject', () => {
    expect(entryModalDraftKey({ userId: 'user-a' }, { entryId: 'entry-1' }))
      .not.toBe(entryModalDraftKey({ userId: 'user-b' }, { entryId: 'entry-1' }));
    expect(entryModalDraftKey({ userId: 'user-a' }, { entryId: 'entry-1' }))
      .not.toBe(entryModalDraftKey({ userId: 'user-a' }, { createScope: 'stream:2026-07-13' }));
    expect(entryModalDraftKey(null, { entryId: 'entry-1' })).toBe('');
  });

  it('restores text, metadata, and the create idempotency key for the same server base', () => {
    const storage = memoryStorage();
    const key = entryModalDraftKey({ userId: 'user-a' }, { entryId: 'entry-1' });
    const values = {
      date: '2026-07-14',
      text: 'A newer local thought',
      mood: 'calm',
      tags: 'idea, next',
    };

    expect(writeEntryModalDraft(storage, key, {
      baseFingerprint,
      values,
      clientRequestId: 'request-1',
      now: Date.parse('2026-07-13T12:05:00.000Z'),
    })).toBe(true);
    expect(readEntryModalDraft(storage, key, {
      baseFingerprint,
      serverUpdatedAt: initialEntry.updatedAt,
      now: Date.parse('2026-07-13T12:06:00.000Z'),
    })).toEqual({
      values,
      savedAt: Date.parse('2026-07-13T12:05:00.000Z'),
      clientRequestId: 'request-1',
    });
  });

  it('expires old drafts and clears them from local storage', () => {
    const storage = memoryStorage();
    const key = entryModalDraftKey({ userId: 'user-a' }, { entryId: 'entry-1' });
    const savedAt = Date.parse('2026-07-13T12:05:00.000Z');
    writeEntryModalDraft(storage, key, { baseFingerprint, values: baseValues, now: savedAt });

    expect(readEntryModalDraft(storage, key, {
      baseFingerprint,
      now: savedAt + ENTRY_MODAL_DRAFT_TTL_MS + 1,
    })).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it('does not apply a draft over a changed or newer server entry', () => {
    const storage = memoryStorage();
    const key = entryModalDraftKey({ userId: 'user-a' }, { entryId: 'entry-1' });
    const savedAt = Date.parse('2026-07-13T12:05:00.000Z');

    writeEntryModalDraft(storage, key, { baseFingerprint, values: baseValues, now: savedAt });
    const changedFingerprint = entryEditorBaseFingerprint(
      { ...initialEntry, updatedAt: '2026-07-13T12:04:00.000Z' },
      { ...baseValues, text: 'Saved somewhere else' },
    );
    expect(readEntryModalDraft(storage, key, {
      baseFingerprint: changedFingerprint,
      now: savedAt + 1,
    })).toBeNull();

    writeEntryModalDraft(storage, key, { baseFingerprint, values: baseValues, now: savedAt });
    expect(readEntryModalDraft(storage, key, {
      baseFingerprint,
      serverUpdatedAt: '2026-07-13T12:06:00.000Z',
      now: Date.parse('2026-07-13T12:07:00.000Z'),
    })).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it('clears a draft after a durable save or explicit discard', () => {
    const storage = memoryStorage();
    const key = entryModalDraftKey({ userId: 'user-a' }, { entryId: 'entry-1' });
    writeEntryModalDraft(storage, key, { baseFingerprint, values: baseValues });
    expect(clearEntryModalDraft(storage, key)).toBe(true);
    expect(storage.getItem(key)).toBeNull();
  });
});
