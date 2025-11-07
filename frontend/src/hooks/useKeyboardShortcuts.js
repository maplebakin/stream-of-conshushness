// frontend/src/hooks/useKeyboardShortcuts.js
// Global keyboard shortcuts hook

import { useEffect } from 'react';

export default function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Build key combination string
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey; // Support both Ctrl and Cmd
      const shift = e.shiftKey;
      const alt = e.altKey;

      // Check each shortcut
      for (const shortcut of shortcuts) {
        const matches =
          shortcut.key.toLowerCase() === key &&
          !!shortcut.ctrl === ctrl &&
          !!shortcut.shift === shift &&
          !!shortcut.alt === alt;

        if (matches) {
          // Don't trigger if user is typing in input/textarea
          const target = e.target;
          const isTyping =
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable;

          // Allow some shortcuts even when typing (like Ctrl+K)
          if (!isTyping || shortcut.allowInInputs) {
            e.preventDefault();
            shortcut.action(e);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
