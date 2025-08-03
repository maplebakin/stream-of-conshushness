import React, { useEffect, useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './DailyRipples.css';

function DailyRipples({ date }) {
  const { token } = useContext(AuthContext);
  const [ripples, setRipples] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    axios
      .get(`/api/ripples/${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(res => setRipples(res.data || []))
      .catch(err => {
        console.error('Error fetching ripples:', err);
        setRipples([]);
      })
      .finally(() => setLoading(false));
  }, [date, token]);

  return (
    <div className="ripples-box">
      <h3>🔮 Ripples from Today’s Stream</h3>
      {loading && <div className="loading">Loading ripples…</div>}
      {!loading && ripples.length === 0 && (
        <div className="empty">No ripples detected yet.</div>
      )}
      <ul>
        {ripples.map((r) => (
          <li key={r._id} className="ripple-item">
            <span className="ripple-text">{r.extractedText}</span>
            <div className="ripple-actions">
              <button disabled title="Coming soon">Add to Tasks</button>
              <button disabled title="Coming soon">Dismiss</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DailyRipples;
