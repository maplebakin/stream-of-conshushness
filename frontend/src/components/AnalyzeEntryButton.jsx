// src/components/AnalyzeEntryButton.jsx
import React, { useState } from 'react';
import TaskModal from '../TaskModal.jsx';

export default function AnalyzeEntryButton({ entryText, entryDateISO }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="button chip"
        onClick={() => setOpen(true)}
        title="Analyze this entry for potential tasks (no auto-add)"
      >
        Analyze for Tasks
      </button>

      {open && (
        <TaskModal
          journalMode
          journalText={entryText || ''}
          journalDate={entryDateISO || ''}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      )}
    </>
  );
}
