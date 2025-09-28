// frontend/src/pages/SectionsIndex.jsx
import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axiosInstance.js';
import { AuthContext } from '../AuthContext.jsx';
import '../Main.css';
import './SectionsIndex.css';

const ACTIVITY_WINDOW = '7d';

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
    public: Boolean(raw.public),
    updatedAt,
  };
}

function formatActivitySummary(stats) {
  if (!stats || typeof stats !== 'object') return '';
  const entries = Number(stats.entries || 0);
  const tasks = Number(stats.tasks || 0);
  const total = entries + tasks;
  if (!total) return '';

  const parts = [];
  if (entries) parts.push(`${entries} ${entries === 1 ? 'entry' : 'entries'}`);
  if (tasks) parts.push(`${tasks} ${tasks === 1 ? 'task' : 'tasks'}`);

  return `${parts.join(' & ')} this week`;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [activity, setActivity] = useState({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');

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

  useEffect(() => {
    if (!token) {
      setActivity({});
      setActivityLoading(false);
      setActivityError('');
      return;
    }

    let ignore = false;

    async function loadActivity() {
      setActivityLoading(true);
      setActivityError('');
      try {
        const res = await axios.get('/api/sections/activity', {
          params: { window: ACTIVITY_WINDOW },
        });
        if (ignore) return;
        const raw = res?.data?.activity || {};
        const mapped = {};
        for (const [slug, stats] of Object.entries(raw)) {
          const entries = Number(stats?.entries || 0);
          const tasks = Number(stats?.tasks || 0);
          const total = Number(stats?.total || entries + tasks);
          mapped[slug] = { entries, tasks, total };
        }
        setActivity(mapped);
      } catch (err) {
        if (ignore) return;
        console.warn('Failed to load section activity:', err?.response?.data || err.message);
        setActivity({});
        setActivityError(err?.response?.data?.error || 'Unable to load section activity.');
      } finally {
        if (!ignore) setActivityLoading(false);
      }
    }

    loadActivity();
    return () => {
      ignore = true;
    };
  }, [token]);

  const filteredSections = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activityMap = activity || {};

    const baseSort = (a, b) => {
      if (a.updatedAt && b.updatedAt) {
        const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (diff !== 0 && Number.isFinite(diff)) return diff;
      } else if (a.updatedAt) {
        return -1;
      } else if (b.updatedAt) {
        return 1;
      }
      return a.title.localeCompare(b.title);
    };

    let next = [...sections];

    if (search) {
      next = next.filter((section) => {
        const haystack = `${section.title || ''} ${section.description || ''}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    if (quickFilter === 'public') {
      next = next.filter((section) => Boolean(section.public));
    } else if (quickFilter === 'recent') {
      next = next.filter((section) => {
        if (!section.updatedAt) return false;
        const value = new Date(section.updatedAt).getTime();
        return Number.isFinite(value) && value >= since;
      });
    } else if (quickFilter === 'active') {
      next = next.filter((section) => {
        const slug = section.slug || section.key || section.id;
        const stats = slug ? activityMap[slug] : null;
        return Boolean(stats?.total);
      });
    }

    if (quickFilter === 'active') {
      next.sort((a, b) => {
        const slugA = a.slug || a.key || a.id;
        const slugB = b.slug || b.key || b.id;
        const statsA = slugA ? activityMap[slugA] : null;
        const statsB = slugB ? activityMap[slugB] : null;
        const totalA = statsA?.total || 0;
        const totalB = statsB?.total || 0;
        if (totalB !== totalA) return totalB - totalA;
        const entriesA = statsA?.entries || 0;
        const entriesB = statsB?.entries || 0;
        if (entriesB !== entriesA) return entriesB - entriesA;
        return baseSort(a, b);
      });
    } else {
      next.sort(baseSort);
    }

    return next;
  }, [sections, searchTerm, quickFilter, activity]);

  const hasActiveFilters = Boolean(searchTerm.trim()) || quickFilter !== 'all';

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

      <div className="sections-index__filters">
        <input
          type="search"
          className="sections-index__search-input"
          placeholder="Search sections…"
          aria-label="Search sections"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          disabled={loading}
        />
        <div className="sections-index__quick-filters" role="group" aria-label="Quick filters">
          {[
            { key: 'all', label: 'All' },
            { key: 'public', label: 'Public' },
            { key: 'recent', label: 'Recently Edited (7d)' },
            { key: 'active', label: 'Most Active' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              className={`sections-index__filter-button${quickFilter === option.key ? ' is-active' : ''}`}
              onClick={() => setQuickFilter(option.key)}
              aria-pressed={quickFilter === option.key}
              disabled={option.key === 'active' && activityLoading}
            >
              {option.label}
              {option.key === 'active' && activityLoading ? '…' : ''}
            </button>
          ))}
        </div>
        {quickFilter === 'active' && activityError && (
          <div className="sections-index__activity-hint muted">{activityError}</div>
        )}
        {quickFilter === 'active' && activityLoading && (
          <div className="sections-index__activity-hint muted">Loading activity…</div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="muted">Loading sections…</div>
      ) : filteredSections.length === 0 ? (
        <div className="empty-state">
          <p>{hasActiveFilters ? 'No sections match your filters yet.' : 'No sections yet.'}</p>
          {!hasActiveFilters && (
            <button type="button" className="button button-secondary" onClick={handleCreate}>
              Create your first section
            </button>
          )}
        </div>
      ) : (
        <div className="sections-index__grid">
          {filteredSections.map((section) => {
            const busy = busyIds.has(section.id);
            const slug = section.slug || section.key || section.id;
            const stats = slug ? activity[slug] : null;
            const activityLabel = stats ? formatActivitySummary(stats) : '';
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
                    <p className="sections-index__meta-updated">{formatUpdatedAt(section.updatedAt)}</p>
                    {section.description && (
                      <p className="sections-index__meta-description">{section.description}</p>
                    )}
                    {activityLabel && (
                      <p className="sections-index__meta-activity">{activityLabel}</p>
                    )}
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
