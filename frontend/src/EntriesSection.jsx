import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';

function EntriesSection({ date }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token } = useContext(AuthContext);

  useEffect(() => {
    if (!date || !token) return;

    setLoading(true);

    const payload = {
      query: `
        query EntriesByDate($date: String!) {
          entries(date: $date) {
            _id
            date
            section
            mood
            tags
            content
          }
        }
      `,
      variables: { date },
    };

    fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.errors) {
          console.error('❌ GraphQL error:', result.errors);
          setEntries([]);
        } else {
          setEntries(result.data.entries || []);
        }
      })
      .catch((err) => {
        console.error('❌ Fetch error:', err);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [date, token]);

  const safeEntries = Array.isArray(entries) ? entries : [];

  return (
    <div className="entries-section">
      <h2>Entries</h2>
      {loading && <p>Loading entries...</p>}
      {safeEntries.length === 0 && !loading && <p>No entries yet for this day.</p>}
      {safeEntries.map((entry) => (
        <div key={entry._id} className="entry-card">
          <h3>{entry.section || 'No Section'}</h3>
          {entry.mood && <p><strong>Mood:</strong> {entry.mood}</p>}
          {entry.tags?.length > 0 && (
            <p><strong>Tags:</strong> {entry.tags.join(', ')}</p>
          )}
          <div
            className="entry-content"
            dangerouslySetInnerHTML={{ __html: entry.content }}
          />
        </div>
      ))}
    </div>
  );
}

export default EntriesSection;
