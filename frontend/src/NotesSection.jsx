import React, { useState, useEffect } from 'react';

function NotesSection({ date }) {
  const [note, setNote] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load saved note for this date
  useEffect(() => {
    if (!date) return;
    const saved = localStorage.getItem(`note-${date}`);
    if (saved) {
      setNote(saved);
    } else {
      setNote('');
    }
    setHasLoaded(true);
  }, [date]);

  // Save to localStorage on change—but only after initial load
  useEffect(() => {
    if (!date || !hasLoaded) return;
    localStorage.setItem(`note-${date}`, note);
  }, [date, note, hasLoaded]);

  const handleChange = (e) => {
    setNote(e.target.value);
  };

  return (
    <>
  <h3>Notes</h3>
  <textarea
    value={note}
    onChange={handleChange}
    placeholder="Write your reflections, affirmations, or thoughts for the day..."
    rows={8}
  />
</>

  );
}

export default NotesSection;
