import React, { useContext, useEffect, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './modal.css';   

export default function ImportantEventModal({ date, onClose, onSaved }) {
  const { token } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(date || '');
  const [cluster, setCluster] = useState('');
  const [entryId, setEntryId] = useState('');
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  // Load entries for that date so the user can link one (optional)
  useEffect(() => {
    if (!eventDate) return;
    axios.get(`/api/entries/${eventDate}`, { headers })
      .then(res => setEntries(res.data || []))
      .catch(() => setEntries([]));
  }, [eventDate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e?.preventDefault?.();
    const t = title.trim();
    if (!t || !eventDate) return;
    setSaving(true);
    try {
      await axios.post('/api/important-events', {
        title: t,
        date: eventDate,
        cluster: cluster || undefined,
        entryId: entryId || undefined
      }, { headers });
      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error('Create important event failed:', err);
      alert('Could not create event');
    } finally {
      setSaving(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); create(); }
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>New Important Event – {date}</h3>
        <form onSubmit={create} style={{ display:'grid', gap:8 }}>
          <label>Title</label>
          <input
            className="input"
            autoFocus
            placeholder="Birthday, school registration, renewal…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={onKey}
            required
          />

          <label>Date</label>
          <input
            className="input"
            type="date"
            value={eventDate}
            onChange={e => setEventDate(e.target.value)}
            required
          />

          <label>Cluster (optional)</label>
          <input
            className="input"
            value={cluster}
            onChange={e => setCluster(e.target.value)}
            placeholder="Home, Colton, Admin…"
          />

          <label>Link to entry (optional)</label>
          <select
            className="input"
            value={entryId}
            onChange={e => setEntryId(e.target.value)}
          >
            <option value="">— none —</option>
            {entries.map(en => (
              <option key={en._id} value={en._id}>
                {en.text?.slice(0, 60) || '(no text)'}
              </option>
            ))}
          </select>

          <div style={{display:'flex', gap:8, marginTop:12, justifyContent:'flex-end'}}>
            <button type="button" className="button chip" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={saving || !title.trim()}>
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
