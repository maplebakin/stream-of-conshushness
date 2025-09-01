// frontend/src/adapters/EntryModal.default.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

/** Toronto-safe YYYY-MM-DD */
function todayISOInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(d);
  const y = p.find(x => x.type === 'year').value;
  const m = p.find(x => x.type === 'month').value;
  const dd = p.find(x => x.type === 'day').value;
  return `${y}-${m}-${dd}`;
}

/**
 * EntryModal (adapter)
 * Props:
 * - initialEntry?: { _id?, text?, date?, section?, cluster? }
 * - defaultDate?: 'YYYY-MM-DD'
 * - onClose: () => void
 * - onSaved?: (entryObj) => void
 *
 * Parent controls mount/unmount, so no `open` prop is needed.
 */
export default function EntryModal({ initialEntry = null, defaultDate, onClose, onSaved }) {
  const { token } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Form state
  const [text, setText] = useState(initialEntry?.text || '');
  const [section, setSection] = useState(initialEntry?.section || '');
  const [cluster, setCluster] = useState(initialEntry?.cluster || '');
  const [date, setDate] = useState(
    initialEntry?.date || defaultDate || todayISOInToronto()
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const dialogRef = useRef(null);
  const firstInputRef = useRef(null);

  // Reset when props change (e.g., opening for a different day)
  useEffect(() => {
    setText(initialEntry?.text || '');
    setSection(initialEntry?.section || '');
    setCluster(initialEntry?.cluster || '');
    setDate(initialEntry?.date || defaultDate || todayISOInToronto());
    setErr('');
  }, [initialEntry, defaultDate]);

  // Autofocus first field
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const payload = useMemo(() => {
    const base = { text: text.trim(), date };
    if (section && section.trim()) base.section = section.trim();
    if (cluster && cluster.trim()) base.cluster = cluster.trim();
    return base;
  }, [text, date, section, cluster]);

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!busy) onClose?.();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!busy) save();
    }
  }

  async function save() {
    setErr('');
    const t = text.trim();
    if (!t) { setErr('Please add some text.'); return; }
    if (!date) { setErr('Please pick a date.'); return; }

    setBusy(true);
    try {
      let saved;
      if (initialEntry?._id) {
        const { data } = await axios.patch(
          `/api/entries/${initialEntry._id}`,
          payload,
          { headers }
        );
        saved = data;
      } else {
        const { data } = await axios.post(
          '/api/entries',
          payload,
          { headers }
        );
        saved = data;
      }
      onSaved?.(saved);
      onClose?.();
    } catch (e) {
      console.error('Entry save failed', e?.response?.data || e.message);
      setErr(e?.response?.data?.error || 'Could not save entry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      ref={dialogRef}
      onKeyDown={onKeyDown}
      onClick={(e) => { if (e.target === dialogRef.current && !busy) onClose?.(); }}
    >
      <div className="modal-card" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h3>{initialEntry?._id ? 'Edit Entry' : 'New Entry'}</h3>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              ref={firstInputRef}
              disabled={busy}
            />
          </label>

          <label className="field">
            <span>Section (optional)</span>
            <input
              type="text"
              className="input"
              placeholder="e.g., Stream / Games / Crochet"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              disabled={busy}
            />
          </label>

          <label className="field">
            <span>Cluster (optional)</span>
            <input
              type="text"
              className="input"
              placeholder="e.g., Home / Work / Health"
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        <label className="field" style={{ marginTop: 8 }}>
          <span>Text</span>
          <textarea
            className="input"
            rows={8}
            style={{ width: '100%', fontFamily: 'inherit' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />
        </label>

        {err && <div className="error" role="alert" style={{ marginTop: 8 }}>{err}</div>}

        <div className="modal-actions">
          <div className="muted" aria-hidden>
            <span className="pill pill-muted">Esc</span> close · <span className="pill pill-muted">⌘/Ctrl + Enter</span> save
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="button" onClick={save} disabled={busy || !text.trim()}>
              {busy ? 'Saving…' : (initialEntry?._id ? 'Save' : 'Create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
