const STREAM_DRAFT_PREFIX = 'streamQuickEntryDraft';

function userIdentity(user) {
  return String(
    user?._id ||
    user?.id ||
    user?.userId ||
    user?.sub ||
    user?.email ||
    ''
  ).trim();
}

export function streamDraftKey(user) {
  const identity = userIdentity(user);
  return identity ? `${STREAM_DRAFT_PREFIX}:${identity}` : '';
}

export function createClientRequestId(cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  const random = Math.random().toString(36).slice(2);
  return `entry-${Date.now().toString(36)}-${random}`;
}

export function readStreamDraft(storage, key) {
  if (!storage || !key) return null;

  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;

    const text = typeof parsed.text === 'string' ? parsed.text : '';
    if (!text) return null;

    return {
      text,
      date: typeof parsed.date === 'string' ? parsed.date : '',
      clientRequestId: typeof parsed.clientRequestId === 'string' ? parsed.clientRequestId : '',
      submittedText: typeof parsed.submittedText === 'string' ? parsed.submittedText : '',
    };
  } catch {
    return null;
  }
}

export function writeStreamDraft(storage, key, draft) {
  if (!storage || !key) return false;

  try {
    if (!draft?.text) {
      storage.removeItem(key);
      return true;
    }

    storage.setItem(key, JSON.stringify({
      text: String(draft.text),
      date: String(draft.date || ''),
      clientRequestId: String(draft.clientRequestId || ''),
      submittedText: String(draft.submittedText || ''),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearStreamDraft(storage, key) {
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function draftIdentityAfterTextChange({
  clientRequestId,
  submittedText,
  nextText,
  createId = createClientRequestId,
}) {
  if (!nextText) return { clientRequestId: '', submittedText: '' };

  const changedAfterAttempt = Boolean(submittedText) && nextText.trim() !== submittedText;
  return {
    clientRequestId: !clientRequestId || changedAfterAttempt ? createId() : clientRequestId,
    submittedText: changedAfterAttempt ? '' : submittedText,
  };
}
