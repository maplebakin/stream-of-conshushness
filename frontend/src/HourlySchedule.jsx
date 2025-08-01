import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './HourlySchedule.css';

function HourlySchedule({ date }) {
  const [schedule, setSchedule] = useState({});
  const [editingHour, setEditingHour] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const { token } = useContext(AuthContext);

  // Hour labels for the schedule (8AM–6PM)
  const hours = [];
  for (let hour = 8; hour <= 18; hour++) {
    let ampm = hour < 12 ? 'AM' : 'PM';
    let displayHour = hour > 12 ? hour - 12 : hour;
    if (hour === 12) ampm = 'PM';
    hours.push(`${String(displayHour).padStart(2, '0')}:00 ${ampm}`);
  }

  useEffect(() => {
    if (!date || !token) return;
    setLoading(true);
    axios
      .get(`/api/schedule/${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const mapped = {};
        res.data.forEach((item) => {
          mapped[item.hour] = item.text;
        });
        setSchedule(mapped);
      })
      .catch((err) => {
        console.error('Error loading daily schedule:', err);
        setSchedule({});
      })
      .finally(() => setLoading(false));
  }, [date, token]);

  // Start editing a schedule slot
  const handleEditClick = (hour) => {
    setEditingHour(hour);
    setInputValue(schedule[hour] || '');
  };

  // Save a schedule entry
  const handleSave = (hour) => {
    const newSchedule = { ...schedule, [hour]: inputValue };
    setSchedule(newSchedule);
    setEditingHour(null);

    axios
      .post(
        '/api/schedule',
        { date, hour, text: inputValue },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .catch((err) => console.error('Error saving schedule item:', err));
  };

  if (loading) {
    return (
      <div className="hourly-schedule">
        <h3>Daily Schedule Plan</h3>
        <p>Loading schedule…</p>
      </div>
    );
  }

  return (
    <div className="hourly-schedule">
      <h3>Daily Schedule Plan</h3>
      <ul className="schedule-list">
        {hours.map((hourLabel, idx) => {
          // original hour string (e.g., 08:00, 09:00...)
          const hour = `${String(8 + idx).padStart(2, '0')}:00`;
          return (
            <li key={hour} className="schedule-item">
              <span className="hour-label">{hourLabel}</span>
              {editingHour === hour ? (
                <>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSave(hour);
                      }
                    }}
                    aria-label={`Edit schedule for ${hourLabel}`}
                    autoFocus
                  />
                  <button onClick={() => handleSave(hour)} aria-label="Save">Save</button>
                </>
              ) : (
                <span
                  className="schedule-text"
                  onClick={() => handleEditClick(hour)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Edit schedule for ${hourLabel}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') handleEditClick(hour);
                  }}
                >
                  {schedule[hour] || '—'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {/* Appointments are displayed in the DailyPage component's
          dedicated card. The HourlySchedule component focuses on
          the hourly plan only. */}
    </div>
  );
}

export default HourlySchedule;
