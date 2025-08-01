import React, { useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './EntryModal.css';

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

      const res = await axios.post('/api/tasks', newTask, {
        headers: { Authorization: `Bearer ${token}` },
      });

      onTaskCreated?.(res.data);
      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>New Task</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="task-content">Task Description</label>
          <input
            id="task-content"
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What do you want to do?"
            autoFocus
          />

          <label htmlFor="task-due-date">Due Date (optional)</label>
          <input
            id="task-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <label htmlFor="task-repeat">Repeat (e.g. daily, every Monday)</label>
          <input
            id="task-repeat"
            type="text"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />

          <div className="modal-buttons">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={!content.trim()}>Create Task</button>
          </div>
        </form>
      </div>
    </div>
  );
}
