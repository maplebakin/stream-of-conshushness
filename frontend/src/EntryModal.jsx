// frontend/src/EntryModal.jsx
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from './api/axiosInstance';
import toast from 'react-hot-toast';
import { AuthContext } from './AuthContext.jsx';
import { normalizeClusterList, resolveClusterId } from './utils/clusterHelpers.js';
import {
  buildEntryUpdatePayload,
  clearEntryModalDraft,
  cleanEntryTags,
  entryEditorBaseFingerprint,
  entryEditorInitialValues,
  entryModalDraftKey,
  readEntryModalDraft,
  sameEntryTags,
  writeEntryModalDraft,
} from './utils/entryEditor.js';
import { createClientRequestId } from './utils/streamDraft.js';
import { requestErrorSummary } from './utils/requestError.js';
import './modal.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function ensurePortalRoot(id = 'modal-root') {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

function availableLocalStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export default function EntryModal({
  onClose,
  onSaved,
  onAnalyzed,
  initialEntry = null,
  defaultCluster = '',
  defaultTags = [],
  defaultDate,
  date,
}) {
  const root = ensurePortalRoot();
  const { token, user } = useContext(AuthContext);
  const isEditing = Boolean(initialEntry?._id);
  const initialRef = useRef(null);
  if (!initialRef.current) {
    initialRef.current = entryEditorInitialValues({ initialEntry, defaultTags, defaultDate, date });
  }
  const initial = initialRef.current;
  const draftStorageRef = useRef(undefined);
  if (draftStorageRef.current === undefined) {
    draftStorageRef.current = availableLocalStorage();
  }
  const draftKey = entryModalDraftKey(user, {
    entryId: initialEntry?._id,
    createScope: `${defaultCluster || 'stream'}:${initial.date}`,
  });
  const baseFingerprint = entryEditorBaseFingerprint(initialEntry, initial);
  const restoredDraftRef = useRef(undefined);
  if (restoredDraftRef.current === undefined) {
    restoredDraftRef.current = readEntryModalDraft(draftStorageRef.current, draftKey, {
      baseFingerprint,
      serverUpdatedAt: initialEntry?.updatedAt,
    });
  }
  const restoredDraft = restoredDraftRef.current;
  const startingValues = restoredDraft?.values || initial;

  const dialogRef = useRef(null);
  const textareaRef = useRef(null);
  const closeButtonRef = useRef(null);
  const keepEditingRef = useRef(null);
  const savingRef = useRef(false);
  const openerRef = useRef(null);
  const suppressDraftWriteRef = useRef(false);
  const submittedValuesRef = useRef('');
  const createRequestIdRef = useRef('');
  if (!isEditing && !createRequestIdRef.current) {
    createRequestIdRef.current = restoredDraft?.clientRequestId || createClientRequestId();
  }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [clusters, setClusters] = useState([]);
  const [clusterLoading, setClusterLoading] = useState(Boolean(defaultCluster && !isEditing));
  const [clusterError, setClusterError] = useState('');
  const [dateISO, setDateISO] = useState(startingValues.date);
  const [text, setText] = useState(startingValues.text);
  const [mood, setMood] = useState(startingValues.mood);
  const [tags, setTags] = useState(startingValues.tags);

  const dirty = useMemo(() => (
    dateISO !== initial.date ||
    text !== initial.text ||
    mood !== initial.mood ||
    !sameEntryTags(tags, initial.tags)
  ), [dateISO, initial, mood, tags, text]);

  const latestDraftRef = useRef(null);
  latestDraftRef.current = {
    dirty,
    values: { date: dateISO, text, mood, tags },
    clientRequestId: createRequestIdRef.current,
  };

  const persistDraft = useCallback(() => {
    const latest = latestDraftRef.current;
    if (suppressDraftWriteRef.current || !latest?.dirty) return;
    writeEntryModalDraft(draftStorageRef.current, draftKey, {
      baseFingerprint,
      values: latest.values,
      clientRequestId: latest.clientRequestId,
    });
  }, [baseFingerprint, draftKey]);

  useEffect(() => {
    if (!draftKey) return undefined;
    if (!dirty) {
      clearEntryModalDraft(draftStorageRef.current, draftKey);
      return undefined;
    }

    const timeout = window.setTimeout(persistDraft, 250);
    return () => window.clearTimeout(timeout);
  }, [dateISO, dirty, mood, persistDraft, tags, text, draftKey]);

  useEffect(() => () => persistDraft(), [persistDraft]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeUnload = (event) => {
      persistDraft();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty, persistDraft]);

  useEffect(() => {
    if (isEditing || !defaultCluster || !token) {
      setClusters([]);
      setClusterLoading(false);
      setClusterError('');
      return;
    }

    let ignore = false;
    setClusterLoading(true);
    setClusterError('');
    axios.get('/api/clusters')
      .then(({ data }) => {
        if (!ignore) setClusters(normalizeClusterList(data));
      })
      .catch((error) => {
        console.warn('Could not resolve the entry cluster:', requestErrorSummary(error));
        if (!ignore) setClusterError('Could not load the selected cluster.');
      })
      .finally(() => {
        if (!ignore) setClusterLoading(false);
      });

    return () => { ignore = true; };
  }, [defaultCluster, isEditing, token]);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const animationFrame = requestAnimationFrame(() => textareaRef.current?.focus());

    return () => {
      cancelAnimationFrame(animationFrame);
      document.documentElement.style.overflow = previousOverflow;
      const opener = openerRef.current;
      if (opener && typeof opener.focus === 'function' && opener.isConnected) {
        requestAnimationFrame(() => opener.focus());
      }
    };
  }, []);

  const requestClose = useCallback(() => {
    if (savingRef.current) return;
    if (dirty) {
      setConfirmingClose(true);
      requestAnimationFrame(() => keepEditingRef.current?.focus());
      return;
    }
    onClose?.();
  }, [dirty, onClose]);

  const discardChanges = useCallback(() => {
    suppressDraftWriteRef.current = true;
    clearEntryModalDraft(draftStorageRef.current, draftKey);
    onClose?.();
  }, [draftKey, onClose]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (savingRef.current) return;
        if (confirmingClose) {
          setConfirmingClose(false);
          requestAnimationFrame(() => closeButtonRef.current?.focus());
        } else {
          requestClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [confirmingClose, requestClose]);

  function updateField(setter, value) {
    if (!isEditing && submittedValuesRef.current) {
      // A changed payload must not reuse the idempotency key from an uncertain
      // request. An exact retry keeps its key until the user edits again.
      createRequestIdRef.current = createClientRequestId();
      submittedValuesRef.current = '';
    }
    setter(value);
    setSaveError('');
    if (confirmingClose) setConfirmingClose(false);
  }

  async function handleSave(event) {
    event?.preventDefault?.();
    if (savingRef.current) return;
    if (!text.trim()) {
      setSaveError('Write a little something before saving.');
      textareaRef.current?.focus();
      return;
    }

    const tagsList = cleanEntryTags(tags);
    let body;
    if (isEditing) {
      body = buildEntryUpdatePayload(initial, { date: dateISO, text, mood, tags });
      if (!Object.keys(body).length) {
        suppressDraftWriteRef.current = true;
        clearEntryModalDraft(draftStorageRef.current, draftKey);
        onClose?.();
        return;
      }
    } else {
      const clusterId = resolveClusterId(defaultCluster, clusters);
      if (defaultCluster && !clusterId) {
        setSaveError('The selected cluster is no longer available.');
        return;
      }
      body = {
        date: dateISO,
        text,
        mood: mood.trim(),
        cluster: '',
        clusters: clusterId ? [clusterId] : [],
        tags: tagsList,
        clientRequestId: createRequestIdRef.current,
      };
    }

    savingRef.current = true;
    if (!isEditing) {
      submittedValuesRef.current = JSON.stringify({ date: dateISO, text, mood, tags });
    }
    setSaving(true);
    setSaveError('');
    setConfirmingClose(false);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = isEditing
        ? await axios.patch(`/api/entries/${encodeURIComponent(initialEntry._id)}`, body, { headers })
        : await axios.post('/api/entries', body, { headers });

      suppressDraftWriteRef.current = true;
      clearEntryModalDraft(draftStorageRef.current, draftKey);
      toast.success(isEditing ? 'Entry updated' : 'Entry saved');
      onSaved?.(response.data);
      onAnalyzed?.({ entry: response.data, edited: isEditing });
      onClose?.();
    } catch (error) {
      console.error('save entry failed:', requestErrorSummary(error));
      const message = error?.response?.data?.error || 'Could not save entry';
      setSaveError(message);
      toast.error(message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const describedBy = [
    restoredDraft && dirty ? 'entry-draft-recovered' : '',
    saveError ? 'entry-save-error' : '',
    confirmingClose ? 'entry-close-warning' : '',
  ].filter(Boolean).join(' ') || undefined;

  const node = (
    <>
      <div className="sc-modal-backdrop" onClick={requestClose} />
      <div className="sc-modal-shell">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="entry-modal-title"
          aria-describedby={describedBy}
          aria-busy={saving}
          className="sc-modal-card"
          tabIndex={-1}
        >
          <div className="sc-modal-header">
            <h2 id="entry-modal-title" className="sc-modal-title">
              {isEditing ? 'Edit Entry' : 'New Entry'} — {dateISO}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className="sc-modal-close"
              onClick={requestClose}
              aria-label={dirty ? 'Close editor and review unsaved changes' : 'Close editor'}
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSave} className="sc-modal-body">
            <div className="sc-field">
              <label className="sc-label" htmlFor="entry-modal-date">Date</label>
              <input
                id="entry-modal-date"
                className="sc-input"
                type="date"
                required
                value={dateISO}
                onChange={(event) => updateField(setDateISO, event.target.value)}
              />
            </div>

            <div className="sc-field">
              <label className="sc-label" htmlFor="entry-modal-text">Text</label>
              <textarea
                id="entry-modal-text"
                ref={textareaRef}
                className="sc-textarea"
                placeholder={defaultCluster ? `In ${defaultCluster}…` : 'Type here…'}
                value={text}
                onChange={(event) => updateField(setText, event.target.value)}
              />
            </div>

            <div className="sc-grid">
              <div className="sc-field">
                <label className="sc-label" htmlFor="entry-modal-mood">Mood (optional)</label>
                <input
                  id="entry-modal-mood"
                  className="sc-input"
                  type="text"
                  value={mood}
                  onChange={(event) => updateField(setMood, event.target.value)}
                  placeholder="e.g., cozy, focused, crispy"
                />
              </div>

              <div className="sc-field">
                <label className="sc-label" htmlFor="entry-modal-tags">Tags (comma separated)</label>
                <input
                  id="entry-modal-tags"
                  className="sc-input"
                  type="text"
                  value={tags}
                  onChange={(event) => updateField(setTags, event.target.value)}
                  placeholder="e.g., morning pages, #ideas"
                />
              </div>
            </div>

            {restoredDraft && dirty && (
              <p id="entry-draft-recovered" className="muted" role="status">
                Recovered unsaved changes from this device.
              </p>
            )}
            {saveError && <div id="entry-save-error" className="alert error" role="alert">{saveError}</div>}
            {clusterError && <div className="alert error" role="alert">{clusterError}</div>}

            {confirmingClose && (
              <div id="entry-close-warning" className="sc-discard-confirm" role="alert">
                <p>Your changes have not been saved. Keep editing or discard them?</p>
                <div className="sc-discard-confirm__actions">
                  <button
                    ref={keepEditingRef}
                    type="button"
                    className="button"
                    onClick={() => {
                      setConfirmingClose(false);
                      textareaRef.current?.focus();
                    }}
                  >
                    Keep editing
                  </button>
                  <button type="button" className="button sc-discard-button" onClick={discardChanges}>
                    Discard changes
                  </button>
                </div>
              </div>
            )}

            <div className="sc-modal-footer">
              <button
                type="submit"
                className="button bg-lantern text-ink"
                disabled={saving || clusterLoading || Boolean(clusterError)}
              >
                {saving
                  ? 'Saving…'
                  : clusterLoading
                    ? 'Loading cluster…'
                    : isEditing ? 'Save changes' : 'Save entry'}
              </button>
              <button type="button" className="button" onClick={requestClose} disabled={saving}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );

  return createPortal(node, root);
}
