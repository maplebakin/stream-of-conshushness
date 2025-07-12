import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

function HourlySchedule({ date, seedAppointments }) {
  const [appointments, setAppointments] = useState({});
  const [editingHour, setEditingHour] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const { token } = useContext(AuthContext);

  // Build hour labels (8AM to 6PM)
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
    hours.push(`${displayHour}:00 ${period}`);
  }

  // Load appointments from server, merging with seedAppointments
  useEffect(() => {
    if (!date || !token) return;

    axios.get(`/api/appointments/${date}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        const fetched = res.data || {};
        // Merge: server wins if overlapping keys
        const merged = { ...seedAppointments, ...fetched };
        setAppointments(merged);
      })
      .catch(() => {
        // Fallback to seedAppointments only
        setAppointments({ ...seedAppointments });
      });
  }, [date, token, seedAppointments]);

  // Handle clicking to edit
  const handleEditClick = (hourLabel) => {
    setEditingHour(hourLabel);
    setInputValue(appointments[hourLabel] || '');
  };

  // Handle saving
  const handleSave = (hourLabel) => {
    const updated = {
      ...appointments,
      [hourLabel]: inputValue
    };
    setAppointments(updated);
    setEditingHour(null);

    axios.post('/api/add-appointment', {
      date,
      time: hourLabel,
      details: inputValue
    }, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(err => console.error(err));
  };

  // Handle deleting
  const handleDelete = (hourLabel) => {
    axios.delete('/api/delete-appointment', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        date,
        time: hourLabel
      }
    })
      .then(() => {
        const updated = { ...appointments };
        delete updated[hourLabel];
        setAppointments(updated);
      })
      .catch(err => console.error(err));
  };

  return (
    <div className="hourly-schedule">
      <ul>
        {hours.map((label) => (
          <li key={label}>
            <strong>{label}</strong>
            {editingHour === label ? (
              <>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSave(label);
                    }
                  }}
                  autoFocus
                />
                <button onClick={() => handleSave(label)}>Save</button>
              </>
            ) : (
              <>
                <span
                  className="appointment-text"
                  onClick={() => handleEditClick(label)}
                >
                  {appointments[label] ?? ''}
                </span>
                {appointments[label] && (
                  <button
                    className="delete-button"
                    onClick={() => handleDelete(label)}
                    title="Clear this time slot"
                  >
                    🗑️
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default HourlySchedule;
