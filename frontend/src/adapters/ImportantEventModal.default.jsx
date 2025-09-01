// frontend/src/adapters/ImportantEventModal.default.jsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

export default function ImportantEventModal({ defaultDate = '', onClose, onSaved }) {
  const { token } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSave() {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      await axios.post('/api/important-events', { title: t, date, details }, { headers });
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('create important event failed', e?.response?.data || e.message);
      alert('Could not save event.');
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !saving && onClose?.()}>
      <div className="modal-card" role="dialog" aria-modal="true" onKeyDown={onKeyDown}>
        <div className="modal-header">
          <h3>Add important event</h3>
        </div>

        <label className="field">
          <span>Title</span>
          <input
            ref={inputRef}
            className="input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g., Tax filing deadline"
            disabled={saving}
          />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              className="input"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="field">
            <span>Notes (optional)</span>
            <input
              className="input"
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="short note"
              disabled={saving}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button className="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="button" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
