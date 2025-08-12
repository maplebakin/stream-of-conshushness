import React, { useState } from 'react';
import { CheckSquare, Square, Plus } from 'lucide-react';
import axios from './api/axiosInstance';
import TaskModal from './TaskModal';
import './TaskList.css';

export default function TaskList({ tasks: initialTasks = [], selectedDate }) {
  const [showModal, setShowModal] = useState(false);
  const [tasks, setTasks] = useState(initialTasks);

  const toggleComplete = async (task) => {
    try {
      const updated = await axios.put(`/api/tasks/${task._id}`, {
        ...task,
        completed: !task.completed,
      });
      setTasks((prev) =>
        prev.map((t) => (t._id === task._id ? updated.data : t))
      );
    } catch (err) {
      console.error('Toggle complete failed:', err);
    }
  };

  const carryForwardOne = async (task) => {
    try {
      const { data } = await axios.put(`/api/tasks/${task._id}/carry-forward?days=1`);
      setTasks((prev) => prev.map((t) => (t._id === task._id ? data : t)));
    } catch (err) {
      console.error('Carry forward failed:', err);
    }
  };

  return (
    <div className="task-list">
      <div className="task-list-header">
        <h3>Tasks</h3>
        <button onClick={() => setShowModal(true)} className="add-task-btn">
          <Plus size={16} /> Add
        </button>
      </div>

      <ul>
        {tasks.map((task) => {
          const label = task.title || task.notes || '(untitled task)';
          return (
            <li key={task._id} className={`task-item ${task.completed ? 'done' : ''}`}>
              <button className="checkbox" onClick={() => toggleComplete(task)}>
                {task.completed ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
              <span className="task-title">{label}</span>
              <div className="task-actions">
                <button onClick={() => carryForwardOne(task)} title="Move to tomorrow">
                  → Tomorrow
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {showModal && (
        <TaskModal
          date={selectedDate}
          onClose={() => setShowModal(false)}
          onTaskCreated={(newTask) => {
            setTasks((prev) => [...prev, newTask]);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
