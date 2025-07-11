import React, { useState, useEffect } from 'react';
import axios from 'axios';

function HourlySchedule({ date, seedAppointments }) {
  const [appointments, setAppointments] = useState({});
  const [editingHour, setEditingHour] = useState(null);
  const [inputValue, setInputValue] = useState('');

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

  // Load saved plan or seed appointments on date change
  useEffect(() => {
  if (!date) return;

  setAppointments({});

  axios.get(`/api/appointments/${date}`)
    .then(res => setAppointments(res.data || {}))
    .catch(() => setAppointments({}));
}, [date]);


  // Handle clicking to edit
  const handleEditClick = (hourLabel) => {
    setEditingHour(hourLabel);
    setInputValue(appointments[hourLabel] || '');
  };

  // Handle saving the edited text
  const handleSave = (hourLabel) => {
    const updated = {
      ...appointments,
      [hourLabel]: inputValue
    };

    setAppointments(updated);
    setEditingHour(null);
    localStorage.setItem(`schedule-${date}`, JSON.stringify(updated));
  };

  // Handle deleting/clearing a slot
const handleDelete = (hourLabel) => {
  axios.delete(`/api/appointments/${date}/${hourLabel}`)
    .then(() => {
      const updated = { ...appointments };
      delete updated[hourLabel];
      setAppointments(updated);
    })
    .catch(err => console.error(err));
};

  return (
    <div className="hourly-schedule">
      <h2>Schedule</h2>
      <ul>
        {hours.map((label, index) => (
          <li key={index}>
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
