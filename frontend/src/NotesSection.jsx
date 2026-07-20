// src/NotesSection.jsx
import React, { useState, useEffect, useContext, useRef, useMemo, useCallback } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import toast from 'react-hot-toast';
import {
  clearLocalNoteDraft,
  createSerialTaskQueue,
  loadLocalNoteDraft,
  noteNeedsSave,
  saveLocalNoteDraft,
} from './utils/noteDraft.js';
import { requestErrorSummary } from './utils/requestError.js';

export default function NotesSection({ date }) {
  const { token, user } = useContext(AuthContext);
  const ownerId = String(user?.userId || user?._id || user?.id || '');
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const loadedRef = useRef(false);           // becomes true after first fetch
  const lastSavedContentRef = useRef('');    // what the server last accepted
  const debounceRef = useRef(null);
  const activeDateRef = useRef(date);        // guards date-race on saves
  const noteRef = useRef('');
  const saveQueueRef = useRef(null);
  if (saveQueueRef.current === null) saveQueueRef.current = createSerialTaskQueue();

  const queueSave = useCallback((targetDate, content, { updateUI = true } = {}) => {
    if (!targetDate) return Promise.resolve();
    if (updateUI && activeDateRef.current === targetDate) setStatus('saving');

    return saveQueueRef.current(() => (
      axios.post(`/api/note/${targetDate}`, { content }, { headers })
    )).then(() => {
      if (!updateUI || activeDateRef.current !== targetDate) return;
      lastSavedContentRef.current = content;
      if (noteRef.current === content) {
        clearLocalNoteDraft(window.localStorage, ownerId, targetDate);
        setStatus('saved');
        setLastSavedAt(new Date());
      } else {
        setStatus('idle');
      }
    }).catch((err) => {
      console.error('Error saving note:', requestErrorSummary(err));
      if (updateUI && activeDateRef.current === targetDate) {
        setStatus('error');
        toast.error('Error saving note');
      }
      throw err;
    });
  }, [headers, ownerId]);

  // --- Load note for the given date ---
  useEffect(() => {
    if (!date) return;
    activeDateRef.current = date;
    loadedRef.current = false;
    noteRef.current = '';
    lastSavedContentRef.current = '';
    setNote('');
    setLoading(true);
    setStatus('idle');
    setLastSavedAt(null);

    let cancelled = false;

    (async () => {
      try {
        const res = await axios.get(`/api/note/${date}`, { headers });
        if (cancelled) return;
        const content = res?.data?.content ?? '';
        const draft = loadLocalNoteDraft(window.localStorage, ownerId, date);
        const visibleContent = draft && draft.content !== content ? draft.content : content;
        setNote(visibleContent);
        noteRef.current = visibleContent;
        lastSavedContentRef.current = content;
        loadedRef.current = true;
        setStatus(visibleContent === content ? 'saved' : 'idle');
        setLastSavedAt(new Date());
      } catch (err) {
        if (cancelled) return;
        if (err?.response?.status === 404) {
          // No note yet; treat as empty
          setNote('');
          noteRef.current = '';
          lastSavedContentRef.current = '';
          loadedRef.current = true;
          setStatus('idle');
        } else {
          console.error('Error fetching note:', requestErrorSummary(err));
          toast.error('Error fetching note');
          setStatus('error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const pendingContent = noteRef.current;
      const lastSavedContent = lastSavedContentRef.current;
      if (loadedRef.current && noteNeedsSave(pendingContent, lastSavedContent)) {
        void queueSave(date, pendingContent, { updateUI: false }).catch(() => {});
      }
      loadedRef.current = false;
    };
  }, [date, headers, ownerId, queueSave]);

  // --- Save helper (used by debounce + Cmd/Ctrl+S) ---
  const saveNow = useCallback(async () => {
    if (!loadedRef.current) return;
    if (!date || activeDateRef.current !== date) return; // date changed mid-flight
    const content = noteRef.current;

    // nothing changed?
    if (!noteNeedsSave(content, lastSavedContentRef.current)) return;

    try {
      await queueSave(date, content);
    } catch {
      // queueSave owns the visible error state and toast.
    }
  }, [date, queueSave]);

  // --- Debounced autosave on note change ---
  useEffect(() => {
    if (!loadedRef.current || !date) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(saveNow, 800);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [note, date, saveNow]);

  // --- Cmd/Ctrl+S to save immediately ---
  useEffect(() => {
    function onKey(e) {
      const isSave = (e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey);
      if (!isSave) return;
      e.preventDefault();
      // flush debounce first
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      saveNow();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow]);

  useEffect(() => {
    function warnBeforeUnload(event) {
      if (!loadedRef.current || !noteNeedsSave(noteRef.current, lastSavedContentRef.current)) return;
      saveLocalNoteDraft(window.localStorage, ownerId, date, noteRef.current);
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [date, ownerId]);

  function statusLabel() {
    if (loading) return 'Loading…';
    if (status === 'saving') return 'Saving…';
    if (status === 'error') return 'Error';
    if (status === 'saved' && lastSavedAt) {
      const t = lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Saved ${t}`;
    }
    return 'Idle';
    }

  const canSave =
    noteNeedsSave(note, lastSavedContentRef.current);

  return (
    <section className="panel today-notes-panel">
      <div className="side-header today-notes-header">
        <div>
          <h3 className="font-thread text-vein">Remember This</h3>
          <p className="muted">Drop the thing your brain briefly remembered.</p>
        </div>
        <div className="today-notes-actions">
          <span className={`pill ${status==='error' ? 'danger' : status==='saving' ? '' : 'pill-muted'}`}>
            {statusLabel()}
          </span>
          <button
            className="button chip"
            onClick={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              saveNow();
            }}
            disabled={loading || status === 'saving' || !canSave}
            title="Save now (Ctrl/Cmd+S)"
          >
            Save now
          </button>
        </div>
      </div>

      {loading ? (
        <div className="muted today-notes-loading">Loading note…</div>
      ) : (
        <>
          <textarea
            className="input today-notes-textarea"
            value={note}
            onChange={(e) => {
              noteRef.current = e.target.value;
              setNote(e.target.value);
              saveLocalNoteDraft(window.localStorage, ownerId, date, e.target.value);
            }}
            placeholder={`Cottage packing:\n- blanket\n- pillows\n- 4 shirts\n- shorts\n- underwear\n- socks\n- bathing suit`}
            rows={8}
            disabled={status === 'saving' && !note && !lastSavedContentRef.current}
            aria-label={`Remember this note for ${date}`}
          />
          {note.trim() && (
            <div className="today-notes-preview" aria-label="Today notes preview">
              {note}
            </div>
          )}
        </>
      )}
    </section>
  );
}
