// frontend/src/AppointmentModal.jsx
import React, { useState } from 'react';
import './AppointmentModal.css';
import RepeatFields from './components/RepeatFields.jsx';
import ClusterPicker from './components/ClusterPicker.jsx';
import axios from './api/axiosInstance';
import { getStoredAppointmentId, isRecurringAppointment } from './utils/appointmentIds.js';
import { todayISOInToronto } from './utils/date.js';

function parseRRule(rrule = '') {
  const out = {};
  for (const part of String(rrule || '').split(';')) {
    const [key, value] = part.split('=');
    if (key) out[key.toUpperCase()] = value || '';
  }
  return out;
}

function initialRepeat(appointment) {
  const parsed = parseRRule(appointment?.rrule || '');
  return {
    repeatOn: Boolean(parsed.FREQ),
    freq: parsed.FREQ || 'WEEKLY',
    interval: Number.parseInt(parsed.INTERVAL || '1', 10) || 1,
    byday: parsed.BYDAY ? parsed.BYDAY.split(',').filter(Boolean) : ['MO'],
    until: appointment?.until || parsed.UNTIL || '',
  };
}

export default function AppointmentModal({ onClose, onSaved, defaultCluster = '', defaultDate = '', initialAppointment = null }) {
  const editingId = getStoredAppointmentId(initialAppointment);
  const editingRecurringSeries = Boolean(editingId && isRecurringAppointment(initialAppointment));
  const repeatInitial = initialRepeat(initialAppointment);

  // base fields
  const [title, setTitle] = useState(initialAppointment?.title || 'New Appointment');
  const [date, setDate] = useState(initialAppointment?.date || defaultDate || todayISOInToronto());
  const [timeStart, setTimeStart] = useState(initialAppointment?.timeStart || initialAppointment?.time || '');
  const [timeEnd, setTimeEnd] = useState(initialAppointment?.timeEnd || '');
  const [location, setLocation] = useState(initialAppointment?.location || '');
  const [details, setDetails] = useState(initialAppointment?.details || '');
  const [cluster, setCluster] = useState(initialAppointment?.cluster || defaultCluster);

  // repeat state
  const [repeatOn, setRepeatOn] = useState(repeatInitial.repeatOn);
  const [freq, setFreq] = useState(repeatInitial.freq);
  const [interval, setInterval] = useState(repeatInitial.interval);
  const [byday, setByday] = useState(repeatInitial.byday);
  const [startDate, setStartDate] = useState(initialAppointment?.startDate || initialAppointment?.date || defaultDate || todayISOInToronto());
  const [until, setUntil] = useState(repeatInitial.until);

  async function saveAppointment() {
    const body = {
      title,
      timeStart: timeStart || null,
      timeEnd: timeEnd || null,
      location,
      details,
      cluster,
      tz: initialAppointment?.tz || 'America/Toronto',
    };

    if (repeatOn) {
      let r = `FREQ=${freq};INTERVAL=${Math.max(1, parseInt(interval, 10) || 1)}`;
      if (freq === 'WEEKLY' && byday.length) r += `;BYDAY=${byday.join(',')}`;
      if (until) r += `;UNTIL=${until}`;
      body.rrule = r;
      body.startDate = startDate;
      body.until = until || null;
      body.date = null;
    } else {
      body.date = date;
      body.rrule = '';
      body.startDate = null;
      body.until = null;
    }

    const { data } = editingId
      ? await axios.patch(`/api/appointments/${encodeURIComponent(editingId)}`, body)
      : await axios.post('/api/appointments', body);
    return data;
  }

  async function onSubmit(e) {
    e.preventDefault();
    try {
      const appt = await saveAppointment();
      onSaved?.(appt);
      onClose?.();
    } catch (err) {
      console.error('save appointment failed:', err);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="appt-title">
          <div className="modal-header">
            <h3 id="appt-title">{editingId ? 'Edit Appointment' : 'Appointment'}</h3>
            <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          <form className="modal-body" onSubmit={onSubmit}>
            {editingRecurringSeries && (
              <p className="muted" style={{ marginTop: 0 }}>
                This is part of a recurring appointment series. Changes will apply to the whole series.
              </p>
            )}

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
