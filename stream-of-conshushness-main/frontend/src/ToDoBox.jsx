import React, { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

function ToDoBox({ date }) {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState('');
  const { token } = useContext(AuthContext);

  // Load todos once on date change
  useEffect(() => {
    if (!date || !token) return;

    axios.get(`/api/todos/${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => setTodos(res.data || []))
      .catch(() => setTodos([]));
  }, [date, token]);

  // Save helper - only called explicitly after user edits
  const saveTodos = (updated) => {
    if (!date || !token) return;

    if (!Array.isArray(updated) || updated.length === 0) {
      console.log('✅ No todos to save. Skipping POST.');
      return;
    }

    axios.post(`/api/todos/${date}`, { items: updated }, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('❌ Error saving todos:', err));
  };

  // User-initiated changes
  const handleAdd = () => {
    if (!inputValue.trim()) return;
    const updated = [...todos, { text: inputValue.trim(), done: false }];
    setTodos(updated);
    saveTodos(updated);
    setInputValue('');
  };

  const handleToggle = (index) => {
    const updated = [...todos];
    updated[index].done = !updated[index].done;
    setTodos(updated);
    saveTodos(updated);
  };

  const handleStartEdit = (index) => {
    setEditingIndex(index);
    setEditingText(todos[index].text);
  };

  const handleSaveEdit = (index) => {
    const updated = [...todos];
    updated[index].text = editingText;
    setTodos(updated);
    saveTodos(updated);
    setEditingIndex(null);
    setEditingText('');
  };

  const handleDelete = (index) => {
    const updated = todos.filter((_, i) => i !== index);
    setTodos(updated);
    saveTodos(updated);
  };

  return (
    <div className="to-do-box">
      <ul>
        {todos.map((item, index) => (
          <li key={index} className={item.done ? 'done' : ''}>
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => handleToggle(index)}
            />

            {editingIndex === index ? (
              <>
                <input
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit(index);
                    }
                  }}
                  autoFocus
                />
                <button type="button" onClick={() => handleSaveEdit(index)}>Save</button>
              </>
            ) : (
              <span
                className="todo-text"
                onClick={() => handleStartEdit(index)}
              >
                {item.text}
              </span>
            )}

            <button type="button" onClick={() => handleDelete(index)}>🗑️</button>
          </li>
        ))}
      </ul>

      <div className="add-todo">
        <input
          type="text"
          placeholder="New to-do..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button type="button" onClick={handleAdd}>+ Add</button>
      </div>
    </div>
  );
}

export default ToDoBox;
