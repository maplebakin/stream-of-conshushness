import React, { useContext, useEffect, useState } from 'react';
import axios from './api/axiosInstance.js';
import { AuthContext } from './AuthContext.jsx';
import './modal.css';

export default function AppointmentModal({ defaultDate, date, onClose, onSaved }) {
  const { token } = useContext(AuthContext);

  // Accept both prop names for compatibility
  const dateISO = date || defaultDate || new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState('');
  const [timeStart, setTimeStart] = useState('');   // "HH:mm" or ''
  const [timeEnd, setTimeEnd] = useState('');       // optional
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [cluster, setCluster] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [title, timeStart, timeEnd, location, notes, cluster]);

  const stop = (e) => e.stopPropagation();

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        date: dateISO,
        timeStart: timeStart || null,
        timeEnd: timeEnd || null,
        location: location.trim(),
        notes: notes.trim(),
        cluster: cluster.trim() || null,
      };

      await axios.post('/api/appointments', payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error('Create appointment failed:', err);
      setError(err?.response?.data?.error || 'Failed to create appointment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={stop} role="dialog" aria-modal="true" aria-labelledby="appt-title">
        <h3 id="appt-title">New Appointment – {dateISO}</h3>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={create}>
          <label>Title *</label>
          <input
            type="text"
            value={title}
            onChange={e=>setTitle(e.target.value)}
            placeholder="Dentist, School call…"
            required
            autoFocus
          />

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div>
              <label>Start time</label>
              <input type="time" value={timeStart} onChange={e=>setTimeStart(e.target.value)} />
            </div>
            <div>
              <label>End time (optional)</label>
              <input type="time" value={timeEnd} onChange={e=>setTimeEnd(e.target.value)} />
            </div>
          </div>

          <label>Location</label>
          <input type="text" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Clinic, phone, online…" />

          <label>Notes</label>
          <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Anything useful…" />

          <label>Cluster (optional)</label>
          <input type="text" value={cluster} onChange={e=>setCluster(e.target.value)} placeholder="Home, Colton…" />

          <div style={{display:'flex', gap:8, marginTop:12}}>
            <button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
