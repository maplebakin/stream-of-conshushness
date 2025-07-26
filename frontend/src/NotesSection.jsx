import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

// 🟣 Import toast for user feedback
import toast from 'react-hot-toast';

function NotesSection({ date }) {
  const [note, setNote] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const { token } = useContext(AuthContext);

  // Ref to track a debounce timer for saving notes
  const saveTimerRef = useRef(null);

  // Load from server whenever the date changes
  useEffect(() => {
    if (!date) return;
    setHasLoaded(false);

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
      .finally(() => setHasLoaded(true));
  }, [date, token]);

  // Save to server with debounce and toast notifications
  useEffect(() => {
    if (!date || !hasLoaded) return;

    // Clear any existing timer so we only save after the user pauses typing
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      // Perform the save with toast feedback
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
    }, 800); // Save after 800 ms of inactivity

    // Cleanup to cancel pending saves if the component unmounts or dependencies change
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
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
