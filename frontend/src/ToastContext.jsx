// frontend/src/ToastContext.jsx
// Compatibility provider backed by react-hot-toast.

import React, { useCallback } from 'react';
import hotToast from 'react-hot-toast';
import { ToastContext } from './toast-context.js';

function toastOptions(options = {}) {
  return {
    duration: options.duration ?? 5000,
  };
}

function undoToast(message, undoCallback, undoData, options = {}) {
  return hotToast.custom((toast) => {
    const handleUndo = async () => {
      hotToast.dismiss(toast.id);
      await Promise.resolve(undoCallback?.(undoData));
    };

    return (
      <div
        style={{
          background: 'var(--color-ink-strong, #2d2926)',
          color: 'var(--color-mist, white)',
          padding: '14px 16px',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          minWidth: '300px',
          border: '1px solid var(--border-primary)',
        }}
      >
        <span style={{ flex: 1, fontSize: '0.95rem' }}>{message}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleUndo}
            style={{
              padding: '6px 12px',
              background: 'var(--color-spool, #0ea5e9)',
              color: 'white',
              border: 0,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => hotToast.dismiss(toast.id)}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              color: 'var(--color-mist, white)',
              border: 0,
              cursor: 'pointer',
              fontSize: '0.9rem',
              lineHeight: 1,
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }, toastOptions(options));
}

export function ToastProvider({ children }) {
  const removeToast = useCallback((id) => {
    hotToast.dismiss(id);
  }, []);

  const showToast = useCallback((message, options = {}) => {
    if (options.type === 'undo' && options.onUndo) {
      return undoToast(message, options.onUndo, options.undoData, options);
    }

    const config = toastOptions(options);
    if (options.type === 'success') return hotToast.success(message, config);
    if (options.type === 'error') return hotToast.error(message, config);
    if (options.type === 'loading') return hotToast.loading(message, config);
    return hotToast(message, config);
  }, []);

  const showUndo = useCallback((message, undoCallback, undoData) => {
    return undoToast(message, undoCallback, undoData);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast, showUndo }}>
      {children}
    </ToastContext.Provider>
  );
}
