import React, { useContext, useState } from 'react';
import axios from './api/axiosInstance.js';
import { AuthContext } from './AuthContext.jsx';
import './EntryModal.css';

export default function AppointmentModal({ date, onClose, onSaved }) {
  const { token } = useContext(AuthContext);
  const [time, setTime] = useState('');
  const [details, setDetails] = useState('');
  const [cluster, setCluster] = useState('');

  const create = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/appointments', { date, time, details, cluster }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error('Create appointment failed:', err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>New Appointment – {date}</h3>
        <form onSubmit={create}>
          <label>Time</label>
          <input type="time" value={time} onChange={e=>setTime(e.target.value)} required />
          <label>Details</label>
          <input type="text" value={details} onChange={e=>setDetails(e.target.value)} placeholder="Dentist, school call…" required />
          <label>Cluster (optional)</label>
          <input type="text" value={cluster} onChange={e=>setCluster(e.target.value)} placeholder="Home, Colton…" />

          <div style={{display:'flex', gap:8, marginTop:12}}>
            <button type="button" className="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
