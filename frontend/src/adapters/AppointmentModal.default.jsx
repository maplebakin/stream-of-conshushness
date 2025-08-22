// frontend/src/adapters/AppointmentModal.default.jsx
import React, { useContext, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;
}

export default function AppointmentModal({ defaultDate = '', onClose, onSaved }) {
  const { token } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const today = useMemo(() => todayISOInToronto(), []);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate || today);
  const [timeStart, setTimeStart] = useState('');   // HH:MM (optional)
  const [timeEnd, setTimeEnd] = useState('');       // HH:MM (optional)
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setErr('');
    const t = (title || '').trim();
    if (!t) {
      setErr('Please add a title.');
      return;
    }
    setSaving(true);
    try {
      if (timeStart) {
        // Create a timed appointment
        await axios.post('/api/appointments', {
          title: t,
          date,
          timeStart,
          timeEnd: timeEnd || null,
          location: location || '',
          details: details || ''
        }, { headers });
      } else {
        // No time provided → fallback to Important Event (all-day)
        await axios.post('/api/important-events', {
          title: t,
          date,
          details: details || '',
          notes: details || '' // send both in case the API expects one or the other
        }, { headers });
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Save failed', e?.response?.data || e.message);
      setErr('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e)=> e.target === e.currentTarget && !saving && onClose?.()}>
      <div className="modal-card">
        <div className="modal-header">
          <h3>Add Appointment / Important Event</h3>
          <div className="muted" style={{fontSize:'0.85rem'}}>
            Leave “Time” blank to create an all-day Important Event ⭐
          </div>
        </div>

        <label className="field">
          <span>Title</span>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g., Vet, Call with Sam, Anniversary" />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Time (start)</span>
            <input type="time" value={timeStart} onChange={e=>setTimeStart(e.target.value)} />
          </label>
          <label className="field">
            <span>Time (end)</span>
            <input type="time" value={timeEnd} onChange={e=>setTimeEnd(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>Location</span>
          <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Optional" />
        </label>

        <label className="field">
          <span>Details</span>
          <textarea rows={3} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Optional notes" />
        </label>

        {err && <div className="error">{err}</div>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : (timeStart ? 'Add appointment' : 'Add important event')}
          </button>
        </div>
      </div>
    </div>
  );
}
