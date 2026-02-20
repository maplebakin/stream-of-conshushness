// frontend/src/ToastContext.jsx
// Toast notification context provider with undo support

import React, { useState, useCallback } from 'react';
import { ToastContext } from './toast-context.js';

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, options = {}) => {
    const id = Date.now() + Math.random();
    const toast = {
      id,
      message,
      type: options.type || 'info',
      duration: options.duration || 5000,
      onUndo: options.onUndo,
      undoData: options.undoData,
    };

    setToasts((prev) => [...prev, toast]);

    if (toast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration);
    }

    return id;
  }, [removeToast]);

  const showUndo = useCallback((message, undoCallback, undoData) => {
    return showToast(message, {
      type: 'undo',
      duration: 5000,
      onUndo: undoCallback,
      undoData,
    });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast, showUndo }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, removeToast }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: '400px' }}>
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onClose }) {
  const bgColors = {
    info: 'var(--bg-secondary)',
    success: 'var(--status-success, #22c55e)',
    error: 'var(--status-error, #dc2626)',
    undo: 'var(--color-ink-strong, #2d2926)',
  };

  const handleUndo = () => {
    if (toast.onUndo) {
      toast.onUndo(toast.undoData);
    }
    onClose();
  };

  return (
    <div style={{ background: bgColors[toast.type] || bgColors.info, color: toast.type === 'undo' ? 'var(--color-mist, white)' : 'var(--text-primary)', padding: '14px 16px', borderRadius: '8px', boxShadow: 'var(--shadow-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, minWidth: '300px', border: '1px solid var(--border-primary)', animation: 'slideIn 0.3s ease-out' }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <span style={{ flex: 1, fontSize: '0.95rem' }}>{toast.message}</span>

      <div style={{ display: 'flex', gap: 8 }}>
        {toast.type === 'undo' && toast.onUndo && (
          <button onClick={handleUndo} style={{ padding: '6px 12px', background: 'var(--color-spool, #0ea5e9)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
            Undo
          </button>
        )}
        <button onClick={onClose} style={{ padding: '4px 8px', background: 'transparent', color: toast.type === 'undo' ? 'var(--color-mist, white)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  );
}
