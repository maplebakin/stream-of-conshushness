import React, { useEffect, useState, useContext } from 'react';
import './EntryModal.css';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { AuthContext } from './AuthContext.jsx';




export default function EntryModal({ isOpen, onClose, date, entry, existingSections = [] }) {
  const initialSection = entry?.section || 'Floating in the Stream';
  const initialTags = Array.isArray(entry?.tags) ? entry.tags.join(', ') : entry?.tags || '';
  const initialContent = entry?.content || '';

  const { token } = useContext(AuthContext);

  const [isCustomSection, setIsCustomSection] = useState(false);
  const [customSection, setCustomSection] = useState('');

  const [formData, setFormData] = useState({
    section: initialSection,
    tags: initialTags,
    content: initialContent,
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent || '<p></p>',
    autofocus: true,
    editable: true,
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor }) => {
      setFormData((prev) => ({
        ...prev,
        content: editor.getHTML(),
      }));
    },
  });

  useEffect(() => {
    const startingSection = entry?.section || 'Floating in the Stream';
    const custom = !existingSections.includes(startingSection);
    setIsCustomSection(custom);
    setCustomSection(custom ? startingSection : '');
    setFormData({
      section: startingSection,
      tags: initialTags,
      content: initialContent,
    });

    if (editor && initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [entry, editor, existingSections]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSectionChange = (e) => {
    const selected = e.target.value;
    if (selected === '__custom') {
      setIsCustomSection(true);
      setFormData((prev) => ({ ...prev, section: customSection }));
    } else {
      setIsCustomSection(false);
      setFormData((prev) => ({ ...prev, section: selected }));
    }
  };

  const handleCustomSectionChange = (e) => {
    setCustomSection(e.target.value);
    setFormData((prev) => ({ ...prev, section: e.target.value }));
  };

  const handleSave = async () => {
    const tagsArray = formData.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');

    const payload = {
      query: `
        mutation CreateEntry($input: EntryInput!) {
          createEntry(input: $input) {
            _id
            date
            section
            tags
            content
          }
        }
      `,
      variables: {
        input: {
          date: date || new Date().toISOString().slice(0, 10),
          section: formData.section,
          tags: tagsArray,
          content: formData.content,
        }
      }
    };

    try {
      const res = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result.errors) {
        console.error('❌ GraphQL error:', result.errors);
        return;
      }

      console.log('✅ Entry saved:', result.data.createEntry);
      onClose();
    } catch (err) {
      console.error('❌ Network error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{entry ? 'Edit Entry' : 'New Entry'}</h2>

        <label>
          Section:
          <select
            name="section"
            value={isCustomSection ? '__custom' : formData.section}
            onChange={handleSectionChange}
          >
            <option value="">-- Select Section --</option>
            {existingSections.map((section, i) => (
              <option key={i} value={section}>
                {section}
              </option>
            ))}
            <option value="__custom">✏️ Enter Custom Section</option>
          </select>
          {isCustomSection && (
            <input
              type="text"
              name="custom-section"
              value={customSection}
              placeholder="Type your custom section"
              onChange={handleCustomSectionChange}
            />
          )}
        </label>

        <label>
          Tags (comma-separated):
          <input name="tags" value={formData.tags} onChange={handleChange} />
        </label>

        <div>
          <label>Content:</label>
          {editor && (
            <>
              <div className="tiptap-toolbar">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().toggleBold().run();
                  }}
                  className={editor.isActive('bold') ? 'active' : ''}
                >
                  Bold
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().toggleItalic().run();
                  }}
                  className={editor.isActive('italic') ? 'active' : ''}
                >
                  Italic
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().toggleBulletList().run();
                  }}
                  className={editor.isActive('bulletList') ? 'active' : ''}
                >
                  • List
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().toggleOrderedList().run();
                  }}
                  className={editor.isActive('orderedList') ? 'active' : ''}
                >
                  1. List
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().unsetAllMarks().clearNodes().run();
                  }}
                >
                  Clear
                </button>
              </div>

              <EditorContent editor={editor} />
            </>
          )}
        </div>

        <div className="modal-buttons">
          <button onClick={handleSave}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
