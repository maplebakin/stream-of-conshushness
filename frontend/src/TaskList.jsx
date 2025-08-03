import React, { useState } from 'react';
import { CheckSquare, Square, Plus } from 'lucide-react';
import axios from './api/axiosInstance';
import TaskModal from './TaskModal';

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
      console.error('❌ Failed to update task:', err);
    }
  };

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div
          key={task._id}
          className={`flex items-center gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow cursor-pointer ${
            task.completed ? 'bg-green-50 text-green-800 line-through' : 'bg-white text-gray-700'
          }`}
          onClick={() => toggleComplete(task)}
        >
          {task.completed ? (
            <CheckSquare className="h-4 w-4 text-green-600" />
          ) : (
            <Square className="h-4 w-4 text-gray-400" />
          )}
          <span>{task.content}</span>
        </div>
      ))}

      <button
        onClick={() => setShowModal(true)}
        className="w-full p-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 hover:border-gray-300 hover:text-gray-600 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Add new task
      </button>

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
