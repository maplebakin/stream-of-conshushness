// frontend/src/AppointmentModal.jsx
import React, { useEffect, useRef, useState } from 'react';
import './AppointmentModal.css';
import RepeatFields from './components/RepeatFields.jsx';
import ClusterPicker from './components/ClusterPicker.jsx';
import axios from './api/axiosInstance';
import { getStoredAppointmentId, isRecurringAppointment } from './utils/appointmentIds.js';
import { todayISOInToronto } from './utils/date.js';
import { primaryClusterReference } from './utils/clusterHelpers.js';
import { requestErrorSummary } from './utils/requestError.js';
import { appointmentValidationError, initialAppointmentRepeat } from './utils/appointmentRepeat.js';

export default function AppointmentModal({ onClose, onSaved, defaultCluster = '', defaultDate = '', initialAppointment = null }) {
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const previousFocusRef = useRef(null);
  const editingId = getStoredAppointmentId(initialAppointment);
  const editingRecurringSeries = Boolean(editingId && isRecurringAppointment(initialAppointment));
  const repeatInitial = initialAppointmentRepeat(initialAppointment);

  // base fields
  const [title, setTitle] = useState(initialAppointment?.title || 'New Appointment');
  const [date, setDate] = useState(initialAppointment?.date || defaultDate || todayISOInToronto());
  const [timeStart, setTimeStart] = useState(initialAppointment?.timeStart || initialAppointment?.time || '');
  const [timeEnd, setTimeEnd] = useState(initialAppointment?.timeEnd || '');
  const [location, setLocation] = useState(initialAppointment?.location || '');
  const [details, setDetails] = useState(initialAppointment?.details || '');
  const [cluster, setCluster] = useState(primaryClusterReference(initialAppointment) || defaultCluster);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // repeat state
  const [repeatOn, setRepeatOn] = useState(repeatInitial.repeatOn);
  const [freq, setFreq] = useState(repeatInitial.freq);
  const [interval, setInterval] = useState(repeatInitial.interval);
  const [byday, setByday] = useState(repeatInitial.byday);
  const [startDate, setStartDate] = useState(initialAppointment?.startDate || initialAppointment?.date || defaultDate || todayISOInToronto());
  const [until, setUntil] = useState(repeatInitial.until);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    dialog?.querySelector(focusableSelector)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = [...dialog.querySelectorAll(focusableSelector)]
        .filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
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
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  async function saveAppointment() {
    const body = {
      title,
      timeStart: timeStart || null,
      timeEnd: timeEnd || null,
      location,
      details,
      cluster: '',
      clusterId: cluster || null,
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
    if (savingRef.current) return;
    const validationError = appointmentValidationError({
      title,
      date,
      repeatOn,
      startDate,
      until,
      timeStart,
      timeEnd,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const appt = await saveAppointment();
      onSaved?.(appt);
      onClose?.();
    } catch (err) {
      console.error('save appointment failed:', requestErrorSummary(err));
      setError(err?.response?.data?.error || err.message || 'Could not save appointment.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !savingRef.current) onClose?.();
      }}
    >
      <div
        className="modal"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingRef.current) onClose?.();
        }}
      >
        <div
          className="modal-card"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="appt-title"
          tabIndex={-1}
        >
          <div className="modal-header">
            <h3 id="appt-title">{editingId ? 'Edit Appointment' : 'Appointment'}</h3>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close" disabled={saving}>×</button>
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

            {error && <div className="alert error" role="alert">{error}</div>}

            <div className="modal-footer">
              <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="submit" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
