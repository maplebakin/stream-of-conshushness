// src/ManageSections.jsx (updated for new Section API)
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from './api/axiosInstance.js';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import './Main.css';
import { sanitizeSlug } from './utils/slug.js';

const DEFAULT_ICON = '📚';

function normalizeSection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = raw.title || raw.label || raw.name || '';
  const slug = raw.slug || raw.key || sanitizeSlug(title);
  return {
    id: raw.id || raw._id || null,
    title,
    slug,
    icon: raw.icon || raw.emoji || DEFAULT_ICON,
    description: typeof raw.description === 'string' ? raw.description : '',
    public: Boolean(raw.public),
    updatedAt: raw.updatedAt || raw.updated_at || raw.modifiedAt || raw.modified_at || null,
  };
}

export default function ManageSections() {
  const { token, isAuthenticated } = useContext(AuthContext);

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opMsg, setOpMsg] = useState('');
  const flashTimerRef = useRef(null);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newIcon, setNewIcon] = useState(DEFAULT_ICON);
  const [newDescription, setNewDescription] = useState('');
  const [newPublic, setNewPublic] = useState(false);
  const [creating, setCreating] = useState(false);

  // Edit form state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editIcon, setEditIcon] = useState(DEFAULT_ICON);
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  const note = useCallback((message) => {
    setOpMsg(message);
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setOpMsg('');
      flashTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => () => {
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadSections() {
      if (!token) {
        if (!ignore) {
          setSections([]);
          setLoading(false);
        }
        return;
      }

      if (!ignore) setLoading(true);
      try {
        const res = await axios.get('/api/sections');
        if (ignore) return;
        const list = Array.isArray(res.data)
          ? res.data.map(normalizeSection).filter(Boolean)
          : [];
        setSections(list);
      } catch (error) {
        if (ignore) return;
        console.warn('[ManageSections] load failed:', error?.response?.data || error.message);
        setSections([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadSections();
    return () => {
      ignore = true;
    };
  }, [token]);

  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => {
      if (a.updatedAt && b.updatedAt) {
        const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (Number.isFinite(diff) && diff !== 0) return diff;
      } else if (a.updatedAt) {
        return -1;
      } else if (b.updatedAt) {
        return 1;
      }
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [sections]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!token) return;

    const title = newTitle.trim();
    if (!title) return;

    const slugCandidate = sanitizeSlug(newSlug) || sanitizeSlug(title);
    if (!slugCandidate) {
      alert('Slug must contain letters or numbers.');
      return;
    }

    const payload = {
      title,
      slug: slugCandidate,
      icon: (newIcon || DEFAULT_ICON).trim() || DEFAULT_ICON,
      description: newDescription.trim(),
      public: newPublic,
    };

    setCreating(true);
    try {
      const res = await axios.post('/api/sections', payload);
      const created = normalizeSection(res.data) || { id: res.data?._id || slugCandidate, ...payload };
      setSections((prev) => {
        const filtered = prev.filter((item) => item.id !== created.id);
        return [created, ...filtered];
      });
      setNewTitle('');
      setNewSlug('');
      setNewIcon(DEFAULT_ICON);
      setNewDescription('');
      setNewPublic(false);
      note('Section created');
    } catch (error) {
      console.warn('[ManageSections] create failed:', error?.response?.data || error.message);
      alert(error?.response?.data?.error || 'Could not create section');
    } finally {
      setCreating(false);
    }
  }

  function beginEdit(section) {
    setEditingId(section.id);
    setEditTitle(section.title || '');
    setEditSlug(section.slug || '');
    setEditIcon(section.icon || DEFAULT_ICON);
    setEditDescription(section.description || '');
    setEditPublic(Boolean(section.public));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditSlug('');
    setEditIcon(DEFAULT_ICON);
    setEditDescription('');
    setEditPublic(false);
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!editingId) return;

    const title = editTitle.trim();
    if (!title) return;

    const slugCandidate = sanitizeSlug(editSlug) || sanitizeSlug(title);
    if (!slugCandidate) {
      alert('Slug must contain letters or numbers.');
      return;
    }

    const payload = {
      title,
      slug: slugCandidate,
      icon: (editIcon || DEFAULT_ICON).trim() || DEFAULT_ICON,
      description: editDescription.trim(),
      public: editPublic,
    };

    setSaving(true);
    try {
      const res = await axios.put(`/api/sections/${encodeURIComponent(editingId)}`, payload);
      const updated = normalizeSection(res.data) || { id: editingId, ...payload };
      setSections((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      note('Section updated');
      cancelEdit();
    } catch (error) {
      console.warn('[ManageSections] update failed:', error?.response?.data || error.message);
      alert(error?.response?.data?.error || 'Could not update section');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(section) {
    if (!section?.id) return;
    const confirmed = window.confirm(`Delete “${section.title}”? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await axios.delete(`/api/sections/${encodeURIComponent(section.id)}`);
      setSections((prev) => prev.filter((item) => item.id !== section.id));
      note('Section deleted');
    } catch (error) {
      console.warn('[ManageSections] delete failed:', error?.response?.data || error.message);
      alert(error?.response?.data?.error || 'Could not delete section');
    }
  }

  if (!isAuthenticated) {
    return <div className="page" style={{ padding: 24 }}>Please log in.</div>;
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="page" style={{ padding: 24 }}>Loading…</div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div
            className="section-header"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <h2 style={{ margin: 0 }}>Manage Sections</h2>
            {opMsg && <span className="pill">{opMsg}</span>}
          </div>

          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <div className="field">
              <label htmlFor="new-title">Title</label>
              <input
                id="new-title"
                className="input"
                placeholder="e.g., Crochet, Games"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="new-slug">Slug</label>
              <input
                id="new-slug"
                className="input"
                placeholder="Auto-generated from title if left blank"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="new-icon">Icon (emoji)</label>
              <input
                id="new-icon"
                className="input"
                value={newIcon}
                onChange={(event) => setNewIcon(event.target.value)}
                maxLength={4}
              />
            </div>

            <div className="field">
              <label htmlFor="new-description">Description</label>
              <textarea
                id="new-description"
                className="input"
                rows={2}
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Optional short summary"
              />
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={newPublic}
                onChange={(event) => setNewPublic(event.target.checked)}
              />
              <span>Public section</span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="button" disabled={creating}>
                {creating ? 'Creating…' : 'Create section'}
              </button>
            </div>
          </form>
        </div>

        <div className="card" style={{ padding: 16, display: 'grid', gap: 16 }}>
          {sortedSections.length === 0 ? (
            <div className="muted">No sections yet. Create one above to get started.</div>
          ) : (
            sortedSections.map((section) => {
              const editing = editingId === section.id;
              const fallbackSlug = sanitizeSlug(section.slug || section.title || '');
              const baseId = section.id || fallbackSlug || 'section';
              const titleId = `edit-title-${baseId}`;
              const slugId = `edit-slug-${baseId}`;
              const iconId = `edit-icon-${baseId}`;
              const descriptionId = `edit-description-${baseId}`;
              return (
                <div
                  key={section.id || section.slug}
                  className="sections-manage__row"
                  style={{
                    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.24))',
                    borderRadius: 12,
                    padding: 16,
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  {editing ? (
                    <form onSubmit={handleSaveEdit} style={{ display: 'grid', gap: 12 }}>
                      <div className="field">
                        <label htmlFor={titleId}>Title</label>
                        <input
                          id={titleId}
                          className="input"
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          required
                        />
                      </div>

                      <div className="field">
                        <label htmlFor={slugId}>Slug</label>
                        <input
                          id={slugId}
                          className="input"
                          value={editSlug}
                          onChange={(event) => setEditSlug(event.target.value)}
                          required
                        />
                      </div>

                      <div className="field">
                        <label htmlFor={iconId}>Icon</label>
                        <input
                          id={iconId}
                          className="input"
                          value={editIcon}
                          onChange={(event) => setEditIcon(event.target.value)}
                          maxLength={4}
                        />
                      </div>

                      <div className="field">
                        <label htmlFor={descriptionId}>Description</label>
                        <textarea
                          id={descriptionId}
                          className="input"
                          rows={2}
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
                        />
                      </div>

                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={editPublic}
                          onChange={(event) => setEditPublic(event.target.checked)}
                        />
                        <span>Public section</span>
                      </label>

                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button type="submit" className="button" disabled={saving}>
                          {saving ? 'Saving…' : 'Save changes'}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '1.75rem' }} aria-hidden>
                          {section.icon || DEFAULT_ICON}
                        </span>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <strong>{section.title || 'Untitled section'}</strong>
                            {section.public && <span className="pill">Public</span>}
                          </div>
                          <span className="muted">Slug: {section.slug || '—'}</span>
                          {section.description && (
                            <span className="muted">{section.description}</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => beginEdit(section)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="link-button danger"
                          onClick={() => handleDelete(section)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
