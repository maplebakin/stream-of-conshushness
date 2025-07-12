import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from './AuthContext.jsx';

function ToDoBox({ date }) {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState('');
  const { token } = useContext(AuthContext);

  useEffect(() => {
    if (!date) return;

    axios.get(`/api/todos/${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => setTodos(res.data || []))
      .catch(() => setTodos([]));
  }, [date, token]);

  useEffect(() => {
    if (!date) return;

    axios.post(`/api/todos/${date}`, { items: todos }, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Error saving todos:', err));
  }, [date, todos, token]);

  const handleAdd = () => {
    if (!inputValue.trim()) return;
    setTodos([...todos, { text: inputValue.trim(), done: false }]);
    setInputValue('');
  };

  const handleToggle = (index) => {
    const updated = [...todos];
    updated[index].done = !updated[index].done;
    setTodos(updated);
  };

  const handleStartEdit = (index) => {
    setEditingIndex(index);
    setEditingText(todos[index].text);
  };

  const handleSaveEdit = (index) => {
    const updated = [...todos];
    updated[index].text = editingText;
    setTodos(updated);
    setEditingIndex(null);
    setEditingText('');
  };

  const handleDelete = (index) => {
    const updated = todos.filter((_, i) => i !== index);
    setTodos(updated);
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
                    if (e.key === 'Enter') handleSaveEdit(index);
                  }}
                  autoFocus
                />
                <button onClick={() => handleSaveEdit(index)}>Save</button>
              </>
            ) : (
              <span
                className="todo-text"
                onClick={() => handleStartEdit(index)}
              >
                {item.text}
              </span>
            )}

            <button onClick={() => handleDelete(index)}>🗑️</button>
          </li>
        ))}
      </ul>

      <div className="add-todo">
        <input
          type="text"
          placeholder="New to-do..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd}>+ Add</button>
      </div>
    </div>
  );
}

export default ToDoBox;
