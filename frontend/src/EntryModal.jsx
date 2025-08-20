// frontend/src/EntryModal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from './api/axiosInstance';
import toast from 'react-hot-toast';
import './modal.css';

/** Ensure a portal root exists (safe on hard refresh) */
function ensurePortalRoot(id = 'modal-root') {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

export default function EntryModal({
  onClose,
  onSaved,
  defaultCluster = '',
  defaultTags = [],
}) {
  const root = ensurePortalRoot();
  const textareaRef = useRef(null);
  const [saving, setSaving] = useState(false);

  // form state
  const [text, setText] = useState('');
  const [mood, setMood] = useState('');
  const [tags, setTags] = useState(defaultTags.join(', '));

  // Lock page scroll while open
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = prev; };
  }, []);

  // Focus textarea after mount
  useEffect(() => {
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Close on Esc
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!text.trim()) {
      toast('Write a little something first?', { icon: '✍️' });
      return;
    }
    setSaving(true);
    try {
      const cleanTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      const body = {
        text,
        mood: mood.trim(),
        cluster: defaultCluster || '',
        tags: cleanTags,
      };
      const res = await axios.post('/api/entries', body);
      onSaved?.(res.data);
      toast.success('Entry saved');
    } catch (err) {
      console.error('save entry failed:', err?.response?.data || err.message);
      toast.error('Could not save entry');
      setSaving(false);
    }
  }

  const node = (
    <>
      <div className="sc-modal-backdrop" onClick={onClose} />
      <div className="sc-modal-shell" aria-hidden="true" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-entry-title"
          className="sc-modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sc-modal-header">
            <h3 id="new-entry-title" className="sc-modal-title">New Entry</h3>
            <button className="sc-modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          <form onSubmit={handleSave} className="sc-modal-body">
            <div className="sc-field">
              <label className="sc-label">Text</label>
              <textarea
                ref={textareaRef}
                className="sc-textarea"
                placeholder={defaultCluster ? `In ${defaultCluster}…` : 'Type here…'}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <div className="sc-grid">
              <div className="sc-field">
                <label className="sc-label">Mood (optional)</label>
                <input
                  className="sc-input"
                  type="text"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  placeholder="e.g., cozy, focused, crispy"
                />
              </div>

              <div className="sc-field">
                <label className="sc-label">Tags (comma separated)</label>
                <input
                  className="sc-input"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g., morning pages, #ideas"
                />
              </div>
            </div>

            {defaultCluster && (
              <div className="sc-inline-note">
                Cluster: <span className="pill">{defaultCluster}</span>
              </div>
            )}

            <div className="sc-modal-actions">
              <button type="button" className="sc-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="sc-btn sc-btn-primary" disabled={saving || !text.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );

  return createPortal(node, root);
}
