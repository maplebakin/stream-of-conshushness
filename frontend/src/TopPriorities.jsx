import React, { useState, useEffect } from 'react';

function TopPriorities({ date, importantEvents = [] }) {
  const [priorities, setPriorities] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState('');

  // Load saved priorities for this date
 useEffect(() => {
  if (!date) return;

  const saved = localStorage.getItem(`priorities-${date}`);
  const parsed = saved ? JSON.parse(saved) : null;

  console.log('⭐ Checking priorities load:', { date, saved: parsed, importantEvents });

  if (parsed && parsed.length > 0) {
    setPriorities(parsed);
  } else if (importantEvents.length > 0) {
    setPriorities(importantEvents.map(ev => ev.title));
  } else {
    setPriorities([]);
  }

  setHasLoaded(true);
}, [date, importantEvents]);



  // Save to localStorage on change
  useEffect(() => {
  if (!date || !hasLoaded) return;

  if (priorities.length === 0) {
    localStorage.removeItem(`priorities-${date}`);
  } else {
    localStorage.setItem(`priorities-${date}`, JSON.stringify(priorities));
  }
}, [date, priorities, hasLoaded]);


  const handleAdd = () => {
    if (!inputValue.trim()) return;
    setPriorities([...priorities, inputValue.trim()]);
    setInputValue('');
  };

  const handleStartEdit = (index) => {
    setEditingIndex(index);
    setEditingText(priorities[index]);
  };

  const handleSaveEdit = (index) => {
    const updated = [...priorities];
    updated[index] = editingText;
    setPriorities(updated);
    setEditingIndex(null);
    setEditingText('');
  };

  const handleDelete = (index) => {
    const updated = priorities.filter((_, i) => i !== index);
    setPriorities(updated);
  };

  return (
    <div className="top-priorities">
      
      <ul>
        {priorities.map((item, index) => (
          <li key={index}>
            {editingIndex === index ? (
              <>
                <input
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit(index);
                  }}
                  autoFocus
                />
                <button onClick={() => handleSaveEdit(index)}>Save</button>
              </>
            ) : (
              <span
                className="priority-text"
                onClick={() => handleStartEdit(index)}
              >
                {item}
              </span>
            )}
            <button onClick={() => handleDelete(index)}>🗑️</button>
          </li>
        ))}
      </ul>

      <div className="add-priority">
        <input
          type="text"
          placeholder="New priority..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd}>+ Add</button>
      </div>
    </div>
  );
}

export default TopPriorities;
