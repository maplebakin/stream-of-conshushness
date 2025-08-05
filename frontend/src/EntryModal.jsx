// src/EntryModal.jsx
import React, { useEffect, useState, useContext } from 'react';
import './EntryModal.css';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { AuthContext } from './AuthContext.jsx';
import { analyzeEntry } from '../../utils/analyzeEntry.js';

export default function EntryModal({
  isOpen,
  onClose,
  date,
  entry,
  existingSections = [],
  availableGoals = [],
  availableClusters = [],
  onSave,
}) {
  /* ---------- initial state helpers ---------- */
  const blankHTML       = '<p></p>';
  const initialSection  = entry?.section || 'Floating in the Stream';
  const initialTags     = Array.isArray(entry?.tags) ? entry.tags.join(', ') : entry?.tags || '';
  const initialContent  = entry?.content || blankHTML;

  const [formData, setFormData] = useState({
    section : initialSection,
    tags    : initialTags,
    content : initialContent,
  });

  const [mood, setMood]               = useState(entry?.mood || '');
  const [linkedGoal, setLinkedGoal]   = useState(entry?.linkedGoal || '');
  const [cluster, setCluster]         = useState(entry?.cluster || '');
  const [isCustomSection, setIsCustomSection] = useState(false);
  const [customSection,  setCustomSection]    = useState('');
  const [saving, setSaving]           = useState(false);
  const [error,  setError]            = useState('');

  const { token } = useContext(AuthContext);

  /* ---------- tiptap editor ---------- */
  const editor = useEditor({
    extensions: [StarterKit],
    content   : initialContent,
    autofocus : true,
    editable  : true,
    editorProps: {
      attributes: { class: 'tiptap-editor', spellcheck: 'true' },
    },
    onUpdate: ({ editor }) => {
      setFormData(prev => ({ ...prev, content: editor.getHTML() }));
    },
  });

  /* ---------- sync when modal opens ---------- */
  useEffect(() => {
    if (!isOpen) return;

    const startingSection = entry?.section || 'Floating in the Stream';
    const custom          = !existingSections.includes(startingSection);

    setIsCustomSection(custom);
    setCustomSection(custom ? startingSection : '');

    setFormData({
      section : startingSection,
      tags    : initialTags,
      content : initialContent,
    });

    setMood(entry?.mood || '');
    setLinkedGoal(entry?.linkedGoal || '');
    setCluster(entry?.cluster || '');
    setError('');

    if (editor) editor.commands.setContent(initialContent);
  }, [isOpen, entry, editor, existingSections]);

  /* ---------- auto-analyze tags / cluster / mood ---------- */
  useEffect(() => {
    if (formData.content.length < 10) return;
    const { tags, moods, clusters } = analyzeEntry(formData.content);

    // Tags (preserve manual overrides)
    setFormData(prev => ({
      ...prev,
      tags:
        typeof prev.tags === 'string' && prev.tags.trim()
          ? prev.tags
          : tags.map(t => t.name).join(', '),
    }));

    // Mood & cluster (don’t overwrite manual user input)
    setMood   (prev => prev || moods[0]?.name    || '');
    setCluster(prev => prev || clusters[0]?.name || '');
  }, [formData.content]);

  /* ---------- form handlers ---------- */
  const handleSectionChange = e => {
    const selected = e.target.value;
    if (selected === '__custom') {
      setIsCustomSection(true);
      setFormData(prev => ({ ...prev, section: customSection }));
    } else {
      setIsCustomSection(false);
      setFormData(prev => ({ ...prev, section: selected }));
    }
  };

  const handleCustomSectionChange = e => {
    setCustomSection(e.target.value);
    setFormData(prev => ({ ...prev, section: e.target.value }));
  };

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /* ---------- save logic ---------- */
  const handleSave = async () => {
    setSaving(true);
    setError('');

    // basic client-side validation
    if (!formData.section.trim()) {
      setError('Section is required.');
      setSaving(false);
      return;
    }
    if (!formData.content.trim() || formData.content === blankHTML) {
      setError('Content cannot be empty.');
      setSaving(false);
      return;
    }

    const tagsArray =
      typeof formData.tags === 'string'
        ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

    const input = {
      date : date || new Date().toISOString().slice(0, 10),
      section : formData.section,
      tags    : tagsArray,
      content : formData.content,
      mood,
      ...(linkedGoal ? { linkedGoal } : {}),
      ...(cluster    ? { cluster }    : {}),
    };

    const isEditing = Boolean(entry?._id);
    const mutation  = isEditing
      ? `mutation UpdateEntry($id: ID!, $input: EntryInput!) {
           updateEntry(id: $id, input: $input) {
             _id date createdAt section tags content mood linkedGoal cluster
           }
         }`
      : `mutation CreateEntry($input: EntryInput!) {
           createEntry(input: $input) {
             _id date createdAt section tags content mood linkedGoal cluster
           }
         }`;

    try {
      const res = await fetch('/graphql', {
        method : 'POST',
        headers: {
          'Content-Type' : 'application/json',
          Authorization  : `Bearer ${token}`,
        },
        body: JSON.stringify({
          query    : mutation,
          variables: isEditing ? { id: entry._id, input } : { input },
        }),
      });

      const result = await res.json();
      if (result.errors) {
        setError(result.errors[0]?.message || 'Unknown server error');
        setSaving(false);
        return;
      }

      const savedEntry =
        result.data[isEditing ? 'updateEntry' : 'createEntry'];

      onSave?.(savedEntry);          // update feed in MainPage
      onClose();

      /* clear form if this was a brand-new entry */
      if (!isEditing && editor) {
        editor.commands.setContent(blankHTML);
        setFormData({ section: 'Floating in the Stream', tags: '', content: blankHTML });
        setMood(''); setLinkedGoal(''); setCluster('');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  /* ---------- JSX ---------- */
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{entry ? 'Edit Entry' : 'New Entry'}</h2>

        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}

          {/* --- SECTION / TAGS / MOOD --- */}
          <div className="field-group">
            <label>
              Section:
              <select
                name="section"
                value={isCustomSection ? '__custom' : formData.section}
                onChange={handleSectionChange}
              >
                <option value="">-- Select Section --</option>
                {existingSections.map(sec => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
                <option value="__custom">✏️ Enter Custom Section</option>
              </select>
            </label>

            {isCustomSection && (
              <input
                type="text"
                placeholder="Type your custom section"
                value={customSection}
                onChange={handleCustomSectionChange}
              />
            )}

            <label>
              Tags (comma-separated):
              <input name="tags" value={formData.tags} onChange={handleChange} />
            </label>

            <label>
              Mood:
              <input
                value={mood}
                placeholder="e.g. cozy, drained, inspired"
                onChange={e => setMood(e.target.value)}
              />
            </label>
          </div>

          {/* --- CONTENT --- */}
          <div className="field-group">
            <label>Content:</label>
            {editor && (
              <>
                <div className="tiptap-toolbar">
                  <button
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
                    className={editor.isActive('bold') ? 'active' : ''}
                  >Bold</button>
                  <button
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
                    className={editor.isActive('italic') ? 'active' : ''}
                  >Italic</button>
                  <button
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
                    className={editor.isActive('bulletList') ? 'active' : ''}
                  >• List</button>
                  <button
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
                    className={editor.isActive('orderedList') ? 'active' : ''}
                  >1. List</button>
                  <button
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetAllMarks().clearNodes().run(); }}
                  >Clear</button>
                </div>

                <EditorContent editor={editor} />
              </>
            )}
          </div>

          {/* --- GOAL / CLUSTER --- */}
          <div className="field-group horizontal">
            <label>
              Linked Goal:
              <select value={linkedGoal} onChange={e => setLinkedGoal(e.target.value)}>
                <option value="">-- None --</option>
                {availableGoals.map(goal => (
                  <option key={goal._id} value={goal._id}>{goal.description}</option>
                ))}
              </select>
            </label>

            <label>
              Cluster:
              <select value={cluster} onChange={e => setCluster(e.target.value)}>
                <option value="">-- None --</option>
                {availableClusters.map(cl => (
                  <option key={cl._id} value={cl._id}>{cl.name}</option>
                ))}
              </select>
            </label>
          </div>

          {/* --- BUTTONS --- */}
          <div className="modal-buttons">
            <button
              onClick={handleSave}
              disabled={saving || !formData.section.trim() || !formData.content.trim() || formData.content === blankHTML}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
