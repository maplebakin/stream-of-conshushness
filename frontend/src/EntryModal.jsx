import React, { useState, useContext, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { AuthContext } from './AuthContext.jsx';

// Get YYYY-MM-DD in America/Toronto
function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value ?? '0000';
  const m = parts.find(p => p.type === 'month')?.value ?? '01';
  const d = parts.find(p => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export default function EntryModal({
  onClose,
  onSaved,
  defaultCluster = '',
  defaultTags = []
}) {
  const { token } = useContext(AuthContext);

  const [mood, setMood] = useState('');
  const [cluster, setCluster] = useState(defaultCluster || '');
  const [tagsInput, setTagsInput] = useState(Array.isArray(defaultTags) ? defaultTags.join(', ') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [textLen, setTextLen] = useState(0); // ← drives canSave

  // keep inputs in sync if props change
  useEffect(() => setCluster(defaultCluster || ''), [defaultCluster]);
  useEffect(() => setTagsInput(Array.isArray(defaultTags) ? defaultTags.join(', ') : ''), [defaultTags]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    editorProps: { attributes: { class: 'tiptap' } },
    onUpdate: ({ editor }) => {
      const len = editor.getText().replace(/\s+/g, ' ').trim().length;
      setTextLen(len);
    },
    onCreate: ({ editor }) => {
      const len = editor.getText().replace(/\s+/g, ' ').trim().length;
      setTextLen(len);
    }
  });

  const canSave = !saving && textLen > 0;

  const handleSave = useCallback(async () => {
    setError('');
    if (!editor) return;

    const text = editor.getText().replace(/\s+/g, ' ').trim();
    if (!text) { setError('Please type something first.'); return; }

    setSaving(true);
    try {
      const html = editor.getHTML();

      const tagsArr = tagsInput
        ? tagsInput.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const basePayload = {
        date: todayISOInToronto(),
        text,            // required plain text
        html,            // rich content
        content: html,   // legacy/analysis compatibility
        mood: mood || undefined,
        cluster: cluster || undefined
      };

      const payload = tagsArr.length ? { ...basePayload, tags: tagsArr } : basePayload;

      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save entry');

      onSaved?.(data);
      onClose?.();
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }, [editor, token, tagsInput, mood, cluster, onSaved, onClose]);

  // Cmd/Ctrl+Enter to save
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSave) handleSave();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [canSave, handleSave]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New Entry</h3>

        {/* Horizontal meta row */}
        <div
          className="entry-meta-row"
          style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}
        >
          <input
            type="text"
            placeholder="Mood (optional)"
            value={mood}
            onChange={e => setMood(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <input
            type="text"
            placeholder="Tags, comma-separated"
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            style={{ flex: 2, minWidth: 0 }}
          />
          <input
            type="text"
            placeholder="Cluster (optional)"
            value={cluster}
            onChange={e => setCluster(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
        </div>

        {/* Editor gets most of the visual space */}
        <div className="editor-wrap" style={{ marginTop: 12 }}>
          <EditorContent editor={editor} />
        </div>

        {error && (
          <div className="error" style={{ color: 'crimson', marginTop: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={handleSave} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
