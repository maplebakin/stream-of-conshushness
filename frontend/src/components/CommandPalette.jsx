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
  { id: 'nav-goals', label: 'Go to Goals', icon: '🎯', action: 'navigate', target: '/goals', keywords: ['goals', 'plans', 'progress'] },
  { id: 'nav-review', label: 'Go to Review Inbox', icon: '✓', action: 'navigate', target: '/review', keywords: ['review', 'inbox', 'suggestions', 'automation'] },
  { id: 'nav-sections', label: 'Go to Sections', icon: '🗂️', action: 'navigate', target: '/sections', keywords: ['sections', 'wiki'] },
  { id: 'nav-clusters', label: 'Go to Clusters', icon: '🧩', action: 'navigate', target: '/clusters', keywords: ['clusters', 'tags'] },
  { id: 'nav-ripples', label: 'Go to Ripples', icon: '💡', action: 'navigate', target: '/ripples', keywords: ['ripples', 'actions'] },
  { id: 'nav-interests', label: 'Go to Sparks & Interests', icon: '✨', action: 'navigate', target: '/interests', keywords: ['interests', 'sparks', 'curiosities', 'learning'] },
  { id: 'nav-gather-lists', label: 'Go to Gather Lists', icon: '🧺', action: 'navigate', target: '/gather-lists', keywords: ['gather', 'lists', 'groceries', 'supplies', 'containers', 'needs'] },
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
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  const filteredCommands = query.trim()
    ? commands.filter(cmd =>
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.keywords.some(k => k.toLowerCase().includes(query.toLowerCase()))
      )
    : commands;

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current = document.activeElement;
    setQuery('');
    setSelectedIndex(0);
    inputRef.current?.focus();

    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
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
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredCommands.length) {
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredCommands.length) {
        setSelectedIndex(prev => prev === 0 ? filteredCommands.length - 1 : prev - 1);
      }
    } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
      e.preventDefault();
      executeCommand(filteredCommands[selectedIndex]);
    } else if (e.key === 'Tab') {
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        aria-describedby="command-palette-help"
        onKeyDown={handleKeyDown}
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
        <h2 id="command-palette-title" className="visually-hidden">Command palette</h2>

        {/* Search Input */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-primary)' }}>
          <label htmlFor="command-palette-query" className="visually-hidden">Find a command</label>
          <input
            id="command-palette-query"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
          <div id="command-palette-help" style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
            <div role="status" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
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
                <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>{command.icon}</span>
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
