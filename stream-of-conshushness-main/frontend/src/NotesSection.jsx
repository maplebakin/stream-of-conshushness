import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

function NotesSection({ date }) {
  const [note, setNote] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const { token } = useContext(AuthContext);

  // Load from server
  useEffect(() => {
    if (!date) return;
    setHasLoaded(false);

    axios.get(`/api/note/${date}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(res => setNote(res.data || ''))
      .catch(err => {
        console.error('Error fetching note:', err);
        setNote('');
      })
      .finally(() => setHasLoaded(true));
  }, [date, token]);

  // Save to server
  useEffect(() => {
    if (!date || !hasLoaded) return;

    axios.post(`/api/note/${date}`, { content: note }, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(err => console.error('Error saving note:', err));
  }, [date, note, hasLoaded, token]);

  return (
    <>
      <h3>Notes</h3>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Write your reflections, affirmations, or thoughts for the day..."
        rows={8}
      />
    </>
  );
}

export default NotesSection;
