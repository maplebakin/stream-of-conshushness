import React, { useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './TaskModal.css';


export default function TaskModal({
  onClose,
  onTaskCreated,
  entryId = null,
  clusters = [],
  goalId = null,
  date = null, // optional: pre-fill dueDate (YYYY-MM-DD)
}) {
  const { token } = useContext(AuthContext);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(date || '');
  const [repeat, setRepeat] = useState('');
  const [clusterInput, setClusterInput] = useState(''); // comma-separated

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const payload = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      dueDate: dueDate || undefined, // backend accepts YYYY-MM-DD or Date
      repeat: repeat || undefined,
      goalId: goalId || undefined,
      entryId: entryId || undefined,
      clusters: [
        ...clusters,
        ...(
          clusterInput
            ? clusterInput.split(',').map(s => s.trim()).filter(Boolean)
            : []
        )
      ]
    };

    try {
      const { data } = await axios.post('/api/tasks', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onTaskCreated?.(data);
      onClose?.();
    } catch (err) {
      console.error('Create task failed:', err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Create Task</h2>
        <form onSubmit={handleSubmit} className="entry-form">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Short label (e.g., Email school)"
            required
          />

          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Extra details…"
            rows={3}
          />

          <div className="two-col">
            <div>
              <label>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label>Repeat</label>
              <input
                type="text"
                value={repeat}
                onChange={e => setRepeat(e.target.value)}
                placeholder="daily, weekly Tue…"
              />
            </div>
          </div>

          <label>Clusters (comma-separated)</label>
          <input
            type="text"
            value={clusterInput}
            onChange={e => setClusterInput(e.target.value)}
            placeholder="Home, Colton…"
          />

          <div className="modal-buttons">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={!title.trim()}>Create Task</button>
          </div>
        </form>
      </div>
    </div>
  );
}
