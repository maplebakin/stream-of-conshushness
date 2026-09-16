export function noteNeedsSave(content, lastSavedContent) {
  const next = String(content ?? '');
  const previous = String(lastSavedContent ?? '');
  if (next === previous) return false;
  return Boolean(next.trim() || previous.trim());
}

export function createSerialTaskQueue() {
  let tail = Promise.resolve();

  return function enqueue(task) {
    const run = tail
      .catch(() => undefined)
      .then(() => task());
    tail = run;
    return run;
  };
}

const NOTE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const NOTE_DRAFT_MAX_LENGTH = 1_000_000;

export function noteDraftKey(ownerId, date) {
  if (!ownerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '';
  return `streamofconshushness:note-draft:${ownerId}:${date}`;
}

export function saveLocalNoteDraft(storage, ownerId, date, content, now = Date.now()) {
  const key = noteDraftKey(ownerId, date);
  if (!key || !storage || String(content ?? '').length > NOTE_DRAFT_MAX_LENGTH) return false;
  try {
    storage.setItem(key, JSON.stringify({ content: String(content ?? ''), savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function loadLocalNoteDraft(storage, ownerId, date, now = Date.now()) {
  const key = noteDraftKey(ownerId, date);
  if (!key || !storage) return null;
  try {
    const draft = JSON.parse(storage.getItem(key) || 'null');
    if (
      typeof draft?.content !== 'string'
      || !Number.isFinite(draft?.savedAt)
      || now - draft.savedAt > NOTE_DRAFT_TTL_MS
    ) {
      storage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function clearLocalNoteDraft(storage, ownerId, date) {
  const key = noteDraftKey(ownerId, date);
  if (!key || !storage) return;
  try { storage.removeItem(key); } catch { /* storage can be disabled */ }
}
