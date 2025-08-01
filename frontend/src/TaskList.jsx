import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import TaskModal from './TaskModal.jsx';
import './dailypage.css'; // or your soft card styles

function TaskList({ selectedDate }) {
  const { token } = useContext(AuthContext);
  const [tasks, setTasks] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!token) return;

    axios
      .get('/tasks', {
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
      });
  }, [token, selectedDate]);

  const markComplete = async (id) => {
    try {
      await axios.patch(`/tasks/${id}`, { completed: true }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks((prev) => prev.filter((task) => task._id !== id));
    } catch (err) {
      console.error('Failed to mark complete:', err);
    }
  };

  return (
    <div className="task-panel">
      <h3>Today’s Tasks</h3>
      <ul className="scroll-list">
        {tasks.map((task) => (
          <li key={task._id} className="task-item">
            <input type="checkbox" onChange={() => markComplete(task._id)} />
            <span>{task.content}</span>
            {task.dueDate && <small>due {new Date(task.dueDate).toLocaleDateString()}</small>}
          </li>
        ))}
      </ul>
      <button onClick={() => setShowModal(true)}>+ Add Task</button>

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
