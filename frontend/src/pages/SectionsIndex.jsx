import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axiosInstance.js';
import { AuthContext } from '../AuthContext.jsx';
import '../Main.css';
import './SectionsIndex.css';

function slugify(input = '') {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function normalizeSection(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id || raw._id || null;
  const title = raw.title || raw.label || raw.name || 'Untitled section';
  const slug = raw.slug || raw.key || slugify(title);
  const icon = raw.icon || raw.emoji || '📚';
  const updatedAt = raw.updatedAt || raw.updated_at || raw.modifiedAt || raw.modified_at || raw.createdAt || null;

  return {
    id,
    title,
    slug,
    icon,
    description: raw.description || raw.summary || '',
    updatedAt,
  };
}

function formatUpdatedAt(value) {
  if (!value) return 'Never updated';
  try {
    const updated = new Date(value);
    if (Number.isNaN(updated.getTime())) return 'Updated recently';

    const now = Date.now();
    const diffMs = updated.getTime() - now;
    const diffMinutes = Math.round(diffMs / 60000);
    const absMinutes = Math.abs(diffMinutes);

    if (absMinutes < 1) return 'Updated just now';
    if (absMinutes < 60) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return rtf.format(diffMinutes, 'minute');
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return rtf.format(diffHours, 'hour');
    }

    const diffDays = Math.round(diffHours / 24);
    if (Math.abs(diffDays) < 30) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return rtf.format(diffDays, 'day');
    }

    return `Updated ${updated.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: updated.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    })}`;
  } catch {
    return 'Updated recently';
  }
}

export default function SectionsIndex() {
  const navigate = useNavigate();
  const { token, isAuthenticated } = useContext(AuthContext);

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set());

  useEffect(() => {
    if (!token) {
      setSections([]);
      setLoading(false);
      return;
    }

    let ignore = false;

    async function loadSections() {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get('/api/sections');
        if (ignore) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setSections(list.map(normalizeSection).filter(Boolean));
      } catch (err) {
        if (ignore) return;
        console.warn('Failed to load sections:', err?.response?.data || err.message);
        setSections([]);
        setError(err?.response?.data?.error || 'Unable to load sections right now.');
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
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (a.updatedAt) return -1;
      if (b.updatedAt) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [sections]);

  function setBusy(id, busy) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  async function handleCreate() {
    const title = window.prompt('Section title');
    if (!title) return;

    const trimmed = title.trim();
    if (!trimmed) return;

    const tempId = `temp-${Date.now()}`;
    const slug = slugify(trimmed);
    const optimistic = {
      id: tempId,
      title: trimmed,
      slug,
      icon: '📚',
      updatedAt: new Date().toISOString(),
    };

    setSections((prev) => [optimistic, ...prev]);
    try {
      const res = await axios.post('/api/sections', { title: trimmed, slug });
      const created = normalizeSection(res.data);
      setSections((prev) =>
        prev.map((section) => (section.id === tempId ? created || section : section)),
      );
    } catch (err) {
      console.warn('Create section failed:', err?.response?.data || err.message);
      setSections((prev) => prev.filter((section) => section.id !== tempId));
      alert(err?.response?.data?.error || 'Could not create the section.');
    }
  }

  function handleOpen(section) {
    if (!section?.slug) return;
    navigate(`/sections/${encodeURIComponent(section.slug)}`);
  }

  async function handleRename(section) {
    if (!section?.id) return;
    const nextTitle = window.prompt('Rename section', section.title);
    if (!nextTitle) return;

    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === section.title) return;

    const nextSlug = slugify(trimmed);
    const previous = { ...section };

    setBusy(section.id, true);
    setSections((prev) =>
      prev.map((item) =>
        item.id === section.id
          ? { ...item, title: trimmed, slug: nextSlug, updatedAt: new Date().toISOString() }
          : item,
      ),
    );

    try {
      const res = await axios.put(`/api/sections/${encodeURIComponent(section.id)}`, {
        title: trimmed,
        slug: nextSlug,
      });
      const updated = normalizeSection(res.data);
      setSections((prev) =>
        prev.map((item) => (item.id === section.id ? updated || item : item)),
      );
    } catch (err) {
      console.warn('Rename section failed:', err?.response?.data || err.message);
      alert(err?.response?.data?.error || 'Could not rename the section.');
      setSections((prev) =>
        prev.map((item) => (item.id === section.id ? previous : item)),
      );
    } finally {
      setBusy(section.id, false);
    }
  }

  async function handleDelete(section) {
    if (!section?.id) return;
    const confirmed = window.confirm(
      `Delete “${section.title}”? This will remove it for everyone in your account.`,
    );
    if (!confirmed) return;

    const before = sections;
    setSections((prev) => prev.filter((item) => item.id !== section.id));

    try {
      await axios.delete(`/api/sections/${encodeURIComponent(section.id)}`);
    } catch (err) {
      console.warn('Delete section failed:', err?.response?.data || err.message);
      alert(err?.response?.data?.error || 'Could not delete the section.');
      setSections(before);
    }
  }

  if (!isAuthenticated) {
    return <div className="page" style={{ padding: '2rem' }}>Please sign in to view sections.</div>;
  }

  return (
    <div className="page sections-index">
      <header className="sections-index__header">
        <div>
          <h1>Sections</h1>
          <p className="muted">Organise your worlds, hobbies, and quests.</p>
        </div>
        <button type="button" className="button" onClick={handleCreate} disabled={loading}>
          + New Section
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="muted">Loading sections…</div>
      ) : sortedSections.length === 0 ? (
        <div className="empty-state">
          <p>No sections yet.</p>
          <button type="button" className="button button-secondary" onClick={handleCreate}>
            Create your first section
          </button>
        </div>
      ) : (
        <div className="sections-index__grid">
          {sortedSections.map((section) => {
            const busy = busyIds.has(section.id);
            return (
              <article key={section.id || section.slug} className="sections-index__card">
                <button
                  type="button"
                  className="sections-index__card-body"
                  onClick={() => handleOpen(section)}
                  disabled={busy}
                >
                  <div className="sections-index__icon" aria-hidden>{section.icon}</div>
                  <div className="sections-index__meta">
                    <h3>{section.title}</h3>
                    <p>{formatUpdatedAt(section.updatedAt)}</p>
                  </div>
                </button>
                <div className="sections-index__actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleOpen(section)}
                    disabled={busy}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleRename(section)}
                    disabled={busy}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="link-button danger"
                    onClick={() => handleDelete(section)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
