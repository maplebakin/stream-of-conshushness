// src/NotesSection.jsx
import React, { useState, useEffect, useContext, useRef, useMemo, useCallback } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import toast from 'react-hot-toast';

export default function NotesSection({ date }) {
  const { token } = useContext(AuthContext);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const loadedRef = useRef(false);           // becomes true after first fetch
  const lastSavedContentRef = useRef('');    // what the server last accepted
  const debounceRef = useRef(null);
  const activeDateRef = useRef(date);        // guards date-race on saves

  // --- Load note for the given date ---
  useEffect(() => {
    if (!date) return;
    activeDateRef.current = date;
    setLoading(true);
    setStatus('idle');

    let cancelled = false;

    (async () => {
      try {
        const res = await axios.get(`/api/note/${date}`, { headers });
        if (cancelled) return;
        const content = res?.data?.content ?? '';
        setNote(content);
        lastSavedContentRef.current = content;
        loadedRef.current = true;
        setStatus('saved');
        setLastSavedAt(new Date());
      } catch (err) {
        if (cancelled) return;
        if (err?.response?.status === 404) {
          // No note yet; treat as empty
          setNote('');
          lastSavedContentRef.current = '';
          loadedRef.current = true;
          setStatus('idle');
        } else {
          console.error('Error fetching note:', err);
          toast.error('Error fetching note');
          setStatus('error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [date, headers]);

  // --- Save helper (used by debounce + Cmd/Ctrl+S) ---
  const saveNow = useCallback(async () => {
    if (!loadedRef.current) return;
    if (!date || activeDateRef.current !== date) return; // date changed mid-flight
    const content = note;

    // nothing changed?
    if (content === lastSavedContentRef.current) return;
    if (!content.trim() && !lastSavedContentRef.current.trim()) return;

    try {
      setStatus('saving');
      await axios.post(`/api/note/${date}`, { content }, { headers });
      lastSavedContentRef.current = content;
      setStatus('saved');
      setLastSavedAt(new Date());
    } catch (err) {
      console.error('Error saving note:', err);
      setStatus('error');
      toast.error('Error saving note');
    }
  }, [date, note, headers]);

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
    note !== lastSavedContentRef.current &&
    Boolean(note.trim() || lastSavedContentRef.current.trim());

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
            onChange={(e) => setNote(e.target.value)}
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
