import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

function EntriesSection({ date }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token } = useContext(AuthContext);

  useEffect(() => {
    if (!date || !token) return;
    setLoading(true);
    axios
      .get(`/api/entries/${date}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => {
        if (Array.isArray(res.data)) {
          setEntries(res.data);
        } else {
          console.warn('⚠️ Server returned non-array entries', res.data);
          setEntries([]);
        }
      })
      .catch((err) => {
        console.error('⚠️ Error fetching entries:', err);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [date, token]);

  const safeEntries = Array.isArray(entries) ? entries : [];

  const dailyEntries = [...safeEntries]
    .filter((entry) => entry.date === date)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // newest first

  return (
    <div className="entries-section">
      <h2>Journal Entries</h2>
      {loading ? (
        <p>Loading entries...</p>
      ) : dailyEntries.length === 0 ? (
        <p>No entries for this day.</p>
      ) : (
        <ul className="entries-list">
          {dailyEntries.map((entry, index) => (
            <li key={entry._id || index} className="entry-item">
              <div className="entry-card">
                <div className="entry-section">{entry.section}</div>
                <div
                  className="entry-content"
                  dangerouslySetInnerHTML={{ __html: entry.content }}
                />
                {entry.tags && entry.tags.toString().trim().length > 0 && (
                  <div className="entry-tags">
                    {(
                      Array.isArray(entry.tags)
                        ? entry.tags
                        : entry.tags.toString().split(',')
                    ).map((tag, i) => (
                      <span key={i} className="entry-tag">
                        #{tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EntriesSection;
