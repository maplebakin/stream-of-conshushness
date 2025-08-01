import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import TaskModal from './TaskModal.jsx';
import './dailypage.css';

function TaskList({ selectedDate }) {
  const { token } = useContext(AuthContext);
  const [tasks, setTasks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    axios
      .get('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const today = new Date(selectedDate || new Date());
        const filtered = res.data.filter((task) => {
          if (task.completed) return false;
          if (!task.dueDate) return true;
          const due = new Date(task.dueDate);
          return due <= today;
        });
        setTasks(filtered);
      })
      .catch((err) => {
        console.error('Error loading tasks:', err);
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [token, selectedDate]);

  const markComplete = async (id) => {
    setMarkingId(id);
    try {
      await axios.patch(`/api/tasks/${id}`, { completed: true }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks((prev) => prev.filter((task) => task._id !== id));
    } catch (err) {
      console.error('Failed to mark complete:', err);
    } finally {
      setMarkingId(null);
    }
  };

  if (loading) return <p>Loading tasks…</p>;

  return (
    <div className="task-panel">
      <h3>Today’s Tasks</h3>
      {tasks.length === 0 ? (
        <p>No tasks for today 🎉</p>
      ) : (
        <ul className="scroll-list">
          {tasks.map((task) => (
            <li key={task._id} className="task-item">
              <input
                type="checkbox"
                onChange={() => markComplete(task._id)}
                aria-label={`Mark task "${task.content}" complete`}
                disabled={markingId === task._id}
                checked={false}
              />
              <span>{task.content}</span>
              {task.dueDate && <small>due {new Date(task.dueDate).toLocaleDateString()}</small>}
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setShowModal(true)} aria-label="Add new task">
        + Add Task
      </button>

      {showModal && (
        <TaskModal
          onClose={() => setShowModal(false)}
          onTaskCreated={(newTask) => setTasks((prev) => [...prev, newTask])}
        />
      )}
    </div>
  );
}

export default TaskList;
