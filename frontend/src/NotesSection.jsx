import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import toast from 'react-hot-toast';

function NotesSection({ date }) {
  const [note, setNote] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const { token } = useContext(AuthContext);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!date) return;
    setHasLoaded(false);
    setLoading(true);
    axios
      .get(`/api/note/${date}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => setNote(res.data || ''))
      .catch((err) => {
        console.error('Error fetching note:', err);
        setNote('');
      })
      .finally(() => {
        setHasLoaded(true);
        setLoading(false);
      });
  }, [date, token]);

  useEffect(() => {
    if (!date || !hasLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      toast
        .promise(
          axios.post(
            `/api/note/${date}`,
            { content: note },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          {
            loading: 'Saving note…',
            success: 'Note saved!',
            error: 'Error saving note',
          }
        )
        .catch((err) => console.error('Error saving note:', err));
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [date, note, hasLoaded, token]);

  return (
    <>
      <h3>Notes</h3>
      {loading ? (
        <div style={{ opacity: 0.5, fontStyle: 'italic' }}>Loading note…</div>
      ) : (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Write your reflections, affirmations, or thoughts for the day..."
          rows={8}
          disabled={!hasLoaded}
          style={{ opacity: hasLoaded ? 1 : 0.5 }}
        />
      )}
    </>
  );
}

export default NotesSection;
