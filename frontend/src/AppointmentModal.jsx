// frontend/src/AppointmentModal.jsx
import React, { useState, useContext } from 'react';
import './AppointmentModal.css'; // 👈 keep this
import { AuthContext } from './AuthContext.jsx';
import RepeatFields from './components/RepeatFields.jsx';
// if you have a ClusterPicker already, keep this import; otherwise comment it out
import ClusterPicker from './components/ClusterPicker.jsx';

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

export default function AppointmentModal({ onClose, onSaved, defaultCluster = '' }) {
  const { token } = useContext(AuthContext);

  // base fields
  const [title, setTitle] = useState('New Appointment');
  const [date, setDate] = useState(todayISO());
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [cluster, setCluster] = useState(defaultCluster);

  // repeat state
  const [repeatOn, setRepeatOn] = useState(false);
  const [freq, setFreq] = useState('WEEKLY');
  const [interval, setInterval] = useState(1);
  const [byday, setByday] = useState(['MO']);
  const [startDate, setStartDate] = useState(todayISO());
  const [until, setUntil] = useState('');

  async function createAppointment() {
    const body = {
      title,
      timeStart: timeStart || null,
      timeEnd: timeEnd || null,
      location,
      details,
      cluster,
    };

    if (repeatOn) {
      let r = `FREQ=${freq};INTERVAL=${Math.max(1, parseInt(interval, 10) || 1)}`;
      if (freq === 'WEEKLY' && byday.length) r += `;BYDAY=${byday.join(',')}`;
      if (until) r += `;UNTIL=${until}`;
      body.rrule = r;
      body.startDate = startDate;
    } else {
      body.date = date;
    }

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e?.error || 'Failed to create appointment');
    }
    return res.json();
  }

  async function onSubmit(e) {
    e.preventDefault();
    try {
      const appt = await createAppointment();
      onSaved?.(appt);
      onClose?.();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="appt-title">
          <div className="modal-header">
            <h3 id="appt-title">Appointment</h3>
            <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          <form className="modal-body" onSubmit={onSubmit}>
            <label>
              <div>Title</div>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" required />
            </label>

            {!repeatOn && (
              <label>
                <div>Date</div>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </label>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                <div>Start</div>
                <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
              </label>
              <label>
                <div>End</div>
                <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
              </label>
            </div>

            <label>
              <div>Location</div>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Where?" />
            </label>

            <label>
              <div>Details</div>
              <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} />
            </label>

            {/* If you don't have ClusterPicker yet, replace with a plain input */}
            <label>
              <div>Cluster</div>
              <ClusterPicker value={cluster} onChange={setCluster} />
            </label>

            <RepeatFields
              enabled={repeatOn} setEnabled={setRepeatOn}
              freq={freq} setFreq={setFreq}
              interval={interval} setInterval={setInterval}
              byday={byday} setByday={setByday}
              startDate={startDate} setStartDate={setStartDate}
              until={until} setUntil={setUntil}
            />

            <div className="modal-footer">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
