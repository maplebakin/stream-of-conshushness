import { todayISOInToronto } from './date.js';

const ENTRY_MODAL_DRAFT_PREFIX = 'entryModalDraft:v1';
export const ENTRY_MODAL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const ENTRY_MODAL_DRAFT_MAX_LENGTH = 1_000_000;

function editorUserIdentity(user) {
  return String(user?._id || user?.id || user?.userId || user?.sub || '').trim();
}

function normalizedEditorValues(values = {}) {
  return {
    date: typeof values.date === 'string' ? values.date : '',
    text: typeof values.text === 'string' ? values.text : '',
    mood: typeof values.mood === 'string' ? values.mood : '',
    tags: typeof values.tags === 'string'
      ? values.tags
      : Array.isArray(values.tags) ? values.tags.join(', ') : '',
  };
}

function removeStoredDraft(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {
    // Draft recovery must never make the editor unusable when storage is blocked.
  }
}

export function entryModalDraftKey(user, { entryId = '', createScope = '' } = {}) {
  const identity = editorUserIdentity(user);
  if (!identity) return '';

  const subject = entryId
    ? `entry:${String(entryId)}`
    : createScope ? `new:${String(createScope)}` : '';
  if (!subject) return '';

  return `${ENTRY_MODAL_DRAFT_PREFIX}:${encodeURIComponent(identity)}:${encodeURIComponent(subject)}`;
}

/**
 * Ties a local draft to the exact server version it was based on. Including the
 * visible values also protects legacy entries whose API shape has no updatedAt.
 */
export function entryEditorBaseFingerprint(initialEntry, initialValues) {
  return JSON.stringify({
    entryId: String(initialEntry?._id || ''),
    updatedAt: String(initialEntry?.updatedAt || ''),
    values: normalizedEditorValues(initialValues),
  });
}

export function readEntryModalDraft(
  storage,
  key,
  {
    baseFingerprint,
    serverUpdatedAt = '',
    now = Date.now(),
    ttlMs = ENTRY_MODAL_DRAFT_TTL_MS,
  } = {},
) {
  if (!storage || !key || !baseFingerprint) return null;

  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    const savedAt = Number(parsed?.savedAt);
    const expired = !Number.isFinite(savedAt) || savedAt <= 0 || now - savedAt > ttlMs;
    const wrongBase = parsed?.version !== 1 || parsed?.baseFingerprint !== baseFingerprint;
    const serverTimestamp = Date.parse(serverUpdatedAt);
    const serverIsAtLeastAsNew = Number.isFinite(serverTimestamp) && savedAt <= serverTimestamp;

    if (!parsed || typeof parsed !== 'object' || expired || wrongBase || serverIsAtLeastAsNew) {
      removeStoredDraft(storage, key);
      return null;
    }

    return {
      values: normalizedEditorValues(parsed.values),
      savedAt,
      clientRequestId: typeof parsed.clientRequestId === 'string' ? parsed.clientRequestId : '',
    };
  } catch {
    removeStoredDraft(storage, key);
    return null;
  }
}

export function writeEntryModalDraft(
  storage,
  key,
  { baseFingerprint, values, clientRequestId = '', now = Date.now() } = {},
) {
  if (!storage || !key || !baseFingerprint) return false;

  try {
    const serialized = JSON.stringify({
      version: 1,
      savedAt: now,
      baseFingerprint,
      values: normalizedEditorValues(values),
      clientRequestId: String(clientRequestId || ''),
    });
    if (serialized.length > ENTRY_MODAL_DRAFT_MAX_LENGTH) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearEntryModalDraft(storage, key) {
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function plainEntryText(entry) {
  if (typeof entry?.text === 'string' && entry.text.trim()) return entry.text;
  if (typeof entry?.content === 'string' && entry.content.trim() && !/<[^>]+>/.test(entry.content)) return entry.content;
  const markup = entry?.html || entry?.content;
  if (typeof markup !== 'string') return '';
  return markup
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim();
}

export function cleanEntryTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function sameEntryTags(left, right) {
  return JSON.stringify(cleanEntryTags(left)) === JSON.stringify(cleanEntryTags(right));
}

export function entryEditorInitialValues({
  initialEntry,
  defaultTags = [],
  defaultDate,
  date,
}) {
  return {
    date: initialEntry?.date || date || defaultDate || todayISOInToronto(),
    text: plainEntryText(initialEntry),
    mood: typeof initialEntry?.mood === 'string' ? initialEntry.mood : '',
    tags: Array.isArray(initialEntry?.tags)
      ? initialEntry.tags.join(', ')
      : defaultTags.join(', '),
  };
}

export function buildEntryUpdatePayload(initial, current) {
  const updates = {};
  if (current.date !== initial.date) updates.date = current.date;
  if (current.text !== initial.text) {
    updates.text = current.text;
    // This editor produces plain text. Clear stale legacy markup only when the
    // user changed the text; metadata-only edits leave rich fields untouched.
    updates.html = '';
    updates.content = '';
  }
  if (current.mood !== initial.mood) updates.mood = current.mood.trim();
  if (!sameEntryTags(current.tags, initial.tags)) updates.tags = cleanEntryTags(current.tags);
  return updates;
}
