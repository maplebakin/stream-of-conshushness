import React, { useState, useEffect } from 'react';
import './EntryModal.css';

/**
 * A modal dialog for creating or editing a journal entry.
 *
 * Props:
 *   isOpen (boolean): whether the modal is visible
 *   onClose (function): called when the modal should be closed
 *   entry (object|null): the existing entry to edit; if null, a new entry is created
 *   onSave (function): called with the entry data when the user saves
 */
export default function EntryModal({ isOpen, onClose, entry, onSave, existingSections = [] }) {
  // Initialize form state from the provided entry, falling back to defaults
  const [formData, setFormData] = useState({
    section: entry?.section || 'Floating in the Stream',
    tags: Array.isArray(entry?.tags) ? entry.tags.join(', ') : entry?.tags || '',
    content: entry?.content || '',
  });

  // Update form when the entry prop changes (e.g. editing a different entry)
  useEffect(() => {
    setFormData({
      section: entry?.section || 'Floating in the Stream',
      tags: Array.isArray(entry?.tags) ? entry.tags.join(', ') : entry?.tags || '',
      content: entry?.content || '',
    });
  }, [entry]);

  // Close the modal when the user presses Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Prepare tags as an array of trimmed, non-empty strings
    const tagsArray = formData.tags
      ? formData.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];
    // Call onSave with the data; the parent component decides whether to create or update
    onSave({
      ...entry,
      section: formData.section,
      tags: tagsArray,
      content: formData.content,
    });
    onClose();
  };

  return (
    <div className="entry-modal-overlay" onClick={onClose}>
      <div className="entry-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{entry ? 'Edit Entry' : 'New Entry'}</h2>
        <form onSubmit={handleSubmit} className="entry-modal-form">
        <label>
  Section:
  <select
  name="section"
  value={formData.section}
  onChange={handleChange}
>
  <option value="">-- Select Section --</option>
  {existingSections.map((section, i) => (
    <option key={i} value={section}>
      {section}
    </option>
  ))}
  <option value="__custom">✏️ Enter Custom Section</option>
</select>

{formData.section === '__custom' && (
  <input
    type="text"
    name="section"
    value=""
    placeholder="Type your custom section"
    onChange={(e) =>
      setFormData((prev) => ({ ...prev, section: e.target.value }))
    }
  />
)}

</label>


          <label>
            Tags (comma-separated)
            <input
              type="text"
              name="tags"
              placeholder="e.g. ideas, daily"
              value={formData.tags}
              onChange={handleChange}
            />
          </label>
          <label>
            Content
            <textarea
              name="content"
              placeholder="Write your thoughts here"
              value={formData.content}
              onChange={handleChange}
              rows={6}
            />
          </label>
          <div className="entry-modal-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="save-btn">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
