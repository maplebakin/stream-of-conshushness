// frontend/src/components/CommandPalette.jsx
// Keyboard-driven command palette (Ctrl+K)

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';

const commands = [
  // Navigation
  { id: 'nav-home', label: 'Go to Stream', icon: '🌊', action: 'navigate', target: '/', keywords: ['home', 'main', 'stream'] },
  { id: 'nav-today', label: 'Go to Today', icon: '📅', action: 'navigate', target: '/today', keywords: ['today', 'daily', 'now'] },
  { id: 'nav-calendar', label: 'Go to Calendar', icon: '📆', action: 'navigate', target: '/calendar', keywords: ['calendar', 'dates'] },
  { id: 'nav-sections', label: 'Go to Sections', icon: '🗂️', action: 'navigate', target: '/sections', keywords: ['sections', 'wiki'] },
  { id: 'nav-clusters', label: 'Go to Clusters', icon: '🧩', action: 'navigate', target: '/clusters', keywords: ['clusters', 'tags'] },
  { id: 'nav-ripples', label: 'Go to Ripples', icon: '💡', action: 'navigate', target: '/ripples', keywords: ['ripples', 'actions'] },
  { id: 'nav-habits', label: 'Go to Habit Analytics', icon: '📊', action: 'navigate', target: '/habits/analytics', keywords: ['habits', 'analytics', 'stats'] },
  { id: 'nav-search', label: 'Go to Search', icon: '🔍', action: 'navigate', target: '/search', keywords: ['search', 'find'] },
  { id: 'nav-export', label: 'Go to Export', icon: '📦', action: 'navigate', target: '/export', keywords: ['export', 'backup', 'download'] },
  { id: 'nav-trash', label: 'Go to Trash', icon: '🗑️', action: 'navigate', target: '/trash', keywords: ['trash', 'deleted', 'archive', 'recycle'] },

  // Actions
  { id: 'theme-toggle', label: 'Toggle Theme', icon: '🌓', action: 'theme', keywords: ['theme', 'dark', 'light', 'mode'] },
  { id: 'search-focus', label: 'Search Content', icon: '🔍', action: 'navigate', target: '/search', keywords: ['search', 'find', 'query'] },

  // Settings
  { id: 'nav-account', label: 'Go to Account', icon: '👤', action: 'navigate', target: '/account', keywords: ['account', 'profile', 'user'] },
  { id: 'nav-settings', label: 'Go to Settings', icon: '⚙️', action: 'navigate', target: '/settings', keywords: ['settings', 'preferences', 'config'] },
];

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  const filteredCommands = query.trim()
    ? commands.filter(cmd =>
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.keywords.some(k => k.toLowerCase().includes(query.toLowerCase()))
      )
    : commands;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeCommand = (command) => {
    if (command.action === 'navigate') {
      navigate(command.target);
    } else if (command.action === 'theme') {
      toggleTheme();
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev === 0 ? filteredCommands.length - 1 : prev - 1);
    } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
      e.preventDefault();
      executeCommand(filteredCommands[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
          backdropFilter: 'blur(4px)'
        }}
        onClick={onClose}
      />

      {/* Command Palette */}
      <div
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '600px',
          background: 'var(--color-surface)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-elevated)',
          zIndex: 9999,
          border: '1px solid var(--border-primary)',
          overflow: 'hidden'
        }}
      >
        {/* Search Input */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-primary)' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              outline: 'none'
            }}
          />
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            ↑↓ Navigate • ↵ Select • Esc Close
          </div>
        </div>

        {/* Command List */}
        <div
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '0.5rem'
          }}
        >
          {filteredCommands.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No commands found
            </div>
          ) : (
            filteredCommands.map((command, index) => (
              <button
                key={command.id}
                onClick={() => executeCommand(command)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: index === selectedIndex ? 'var(--accent-primary)' : 'transparent',
                  color: index === selectedIndex ? 'white' : 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  textAlign: 'left',
                  transition: 'all 0.1s'
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span style={{ fontSize: '1.5rem' }}>{command.icon}</span>
                <span>{command.label}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer Hint */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>Quick navigation & actions</span>
          <span>Press <kbd style={{ padding: '2px 6px', background: 'var(--bg-primary)', borderRadius: '3px', border: '1px solid var(--border-primary)' }}>Ctrl+K</kbd> to open</span>
        </div>
      </div>
    </>
  );
}
