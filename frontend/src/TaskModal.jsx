import React, { useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './EntryModal.css'; // reusing base styles for modal

export default function TaskModal({ onClose, onTaskCreated, entryId = null, cluster = null, goalId = null }) {
  const { token } = useContext(AuthContext);
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [repeat, setRepeat] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    try {
      const newTask = {
        content,
        dueDate,
        repeat,
        entryId,
        cluster,
        goalId,
      };

      const res = await axios.post('/tasks', newTask, {
        headers: { Authorization: `Bearer ${token}` },
      });

      onTaskCreated?.(res.data);
      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>New Task</h2>
        <form onSubmit={handleSubmit}>
          <label>Task Description</label>
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What do you want to do?"
          />

          <label>Due Date (optional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <label>Repeat (e.g. daily, every Monday)</label>
          <input
            type="text"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />

          <button type="submit">Create Task</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}
