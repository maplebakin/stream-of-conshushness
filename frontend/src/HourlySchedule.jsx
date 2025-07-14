import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './HourlySchedule.css';

function HourlySchedule({ date }) {
  const [schedule, setSchedule] = useState({});
  const [appointments, setAppointments] = useState([]);
  const [editingHour, setEditingHour] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const { token } = useContext(AuthContext);

  // Hour labels for the schedule (8AM–6PM)
  const hours = [];
  for (let hour = 8; hour <= 18; hour++) {
    let displayHour = hour;
    let period = 'AM';
    if (hour > 12) {
      displayHour = hour - 12;
      period = 'PM';
    } else if (hour === 12) {
      period = 'PM';
    }
    hours.push(`${String(hour).padStart(2, '0')}:00`);
  }

  // Load rough day plan (DailySchedule)
  useEffect(() => {
    if (!date || !token) return;
    axios.get(`/api/schedule/${date}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        const mapped = {};
        res.data.forEach(item => {
          mapped[item.hour] = item.text;
        });
        setSchedule(mapped);
      })
      .catch(err => {
        console.error('Error loading daily schedule:', err);
        setSchedule({});
      });
  }, [date, token]);

  // Load appointments for the day
  useEffect(() => {
    if (!date || !token) return;
    axios.get(`/api/appointments/${date}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        setAppointments(res.data || []);
      })
      .catch(err => {
        console.error('Error loading appointments:', err);
        setAppointments([]);
      });
  }, [date, token]);

  // Handle editing
  const handleEditClick = (hour) => {
    setEditingHour(hour);
    setInputValue(schedule[hour] || '');
  };

  const handleSave = (hour) => {
    const newSchedule = { ...schedule, [hour]: inputValue };
    setSchedule(newSchedule);
    setEditingHour(null);

    axios.post('/api/schedule', {
      date,
      hour,
      text: inputValue
    }, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(err => console.error('Error saving schedule item:', err));
  };

  return (
    <div className="hourly-schedule">
      <h3>Daily Schedule Plan</h3>
      <ul className="schedule-list">
        {hours.map(hour => (
          <li key={hour} className="schedule-item">
            <span className="hour-label">{hour}</span>
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
                  autoFocus
                />
                <button onClick={() => handleSave(hour)}>Save</button>
              </>
            ) : (
              <span
                className="schedule-text"
                onClick={() => handleEditClick(hour)}
              >
                {schedule[hour] || '—'}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="appointments-section">
        <h3>Appointments for This Day</h3>
        {appointments.length === 0 && <p className="no-appointments">No appointments yet.</p>}
        <ul className="appointments-list">
          {appointments
            .sort((a, b) => a.time.localeCompare(b.time))
            .map(app => (
              <li key={app._id} className="appointment-item">
                <strong>{app.time}</strong> — {app.details}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

export default HourlySchedule;
