// src/HourlySchedule.jsx
import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './HourlySchedule.css';

function formatHourLabel(h24) {
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:00 ${ampm}`;
}

export default function HourlySchedule({
  date,                 // 'YYYY-MM-DD'
  startHour = 8,        // inclusive (0–23)
  endHour = 18,         // inclusive (0–23)
}) {
  const { token } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const hours = useMemo(() => {
    const list = [];
    const lo = Math.max(0, Math.min(23, startHour));
    const hi = Math.max(lo, Math.min(23, endHour));
    for (let h = lo; h <= hi; h++) {
      list.push({ key: `${String(h).padStart(2, '0')}:00`, label: formatHourLabel(h) });
    }
    return list;
  }, [startHour, endHour]);

  const [schedule, setSchedule] = useState({});         // { '08:00': '...' }
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // edit state
  const [editingHour, setEditingHour] = useState(null); // '08:00'
  const [inputValue, setInputValue] = useState('');
  const [savingHour, setSavingHour] = useState(null);   // hour key while saving
  const liveRef = useRef(null);

  useEffect(() => {
    if (!date || !token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const res = await axios.get(`/api/schedule/${date}`, { headers });
        if (cancelled) return;
        const mapped = {};
        (Array.isArray(res.data) ? res.data : []).forEach(item => {
          if (item && item.hour) mapped[item.hour] = item.text || '';
        });
        setSchedule(mapped);
      } catch (err) {
        if (!cancelled) {
          setSchedule({});
          setErrorMsg('Failed to load schedule.');
          console.warn('HourlySchedule load error:', err?.response?.data || err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, token]); // reload when date changes

  function beginEdit(hourKey) {
    setEditingHour(hourKey);
    setInputValue(schedule[hourKey] || '');
  }

  async function persist(hourKey, text) {
    setSavingHour(hourKey);
    const prev = schedule[hourKey] || '';
    // optimistic update
    setSchedule(s => ({ ...s, [hourKey]: text }));
    try {
      await axios.post(
        '/api/schedule',
        { date, hour: hourKey, text },
        { headers }
      );
      liveRef.current && (liveRef.current.textContent = 'Saved');
    } catch (err) {
      // rollback on failure
      setSchedule(s => ({ ...s, [hourKey]: prev }));
      liveRef.current && (liveRef.current.textContent = 'Save failed');
      console.warn('HourlySchedule save error:', err?.response?.data || err.message);
      alert('Could not save this slot. Please try again.');
    } finally {
      setSavingHour(null);
    }
  }

  async function handleSave(hourKey) {
    const trimmed = inputValue.trim();
    await persist(hourKey, trimmed);
    setEditingHour(null);
  }

  async function handleClear(hourKey) {
    setInputValue('');
    await persist(hourKey, '');
    setEditingHour(null);
  }

  if (loading) {
    return (
      <div className="hourly-schedule">
        <h3>Daily Schedule Plan</h3>
        <p className="muted" aria-live="polite">Loading…</p>
      </div>
    );
  }

  return (
    <div className="hourly-schedule">
      <h3>Daily Schedule Plan</h3>
      {errorMsg && <div className="error" role="alert">{errorMsg}</div>}

      <ul className="schedule-list">
        {hours.map(({ key: hourKey, label }) => {
          const isEditing = editingHour === hourKey;
          const isSaving = savingHour === hourKey;
          const text = schedule[hourKey] || '';

          return (
            <li key={hourKey} className={`schedule-item ${isEditing ? 'editing' : ''}`}>
              <span className="hour-label">{label}</span>

              {isEditing ? (
                <div className="edit-row">
                  <input
                    className="schedule-input"
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSave(hourKey);
                      if (e.key === 'Escape') setEditingHour(null);
                    }}
                    aria-label={`Edit schedule for ${label}`}
                    disabled={isSaving}
                    autoFocus
                  />
                  <div className="btn-row">
                    <button
                      className="btn sm"
                      onClick={() => handleSave(hourKey)}
                      disabled={isSaving}
                      aria-label="Save"
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      className="btn sm ghost"
                      onClick={() => setEditingHour(null)}
                      disabled={isSaving}
                      aria-label="Cancel"
                    >
                      Cancel
                    </button>
                    {text && (
                      <button
                        className="btn sm danger"
                        onClick={() => handleClear(hourKey)}
                        disabled={isSaving}
                        aria-label="Clear slot"
                        title="Clear this slot"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`schedule-text ${text ? '' : 'empty'}`}
                  onClick={() => beginEdit(hourKey)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') beginEdit(hourKey);
                  }}
                  aria-label={`Edit schedule for ${label}`}
                >
                  {text || '—'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* polite live region for save status */}
      <div
        ref={liveRef}
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}
      />
    </div>
  );
}
