// AppointmentModal.jsx
import React, { useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext';
import './EntryModal.css';

export default function AppointmentModal({ date, onClose, onAppointmentCreated }) {
  const { token } = useContext(AuthContext);
  const [time, setTime] = useState('');
  const [details, setDetails] = useState('');
  const [location, setLocation] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!details || !time) return;

    try {
      const res = await axios.post('/api/appointments', {
        date,
        time,
        details,
        location
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      onAppointmentCreated?.(res.data);
      onClose();
    } catch (err) {
      console.error('Failed to create appointment:', err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Appointment</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="appt-time">Time</label>
          <input
            id="appt-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />

          <label htmlFor="appt-details">Details</label>
          <input
            id="appt-details"
            type="text"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="e.g. Doctor, meeting, etc"
            required
          />

          <label htmlFor="appt-location">Location</label>
          <input
            id="appt-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional"
          />

          <div className="modal-buttons">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={!time || !details}>Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}
