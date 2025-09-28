import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../api/axiosInstance.js';
import { AuthContext } from '../AuthContext.jsx';
import TaskList from '../adapters/TaskList.default.jsx';
import SafeHTML from '../components/SafeHTML.jsx';
import '../Main.css';
import './SectionPage.css';

const LAYOUT_OPTIONS = [
  { value: 'flow', label: 'Flow' },
  { value: 'grid', label: 'Grid' },
  { value: 'kanban', label: 'Kanban' },
  { value: 'tree', label: 'Tree' },
];

const SUBNAV_LINKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'entries', label: 'Entries' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'settings', label: 'Settings' },
];

const DEFAULT_THEME = {
  primary: '#6b6bff',
  surface: '#141418',
  accent: '#c8b6ff',
  radius: 18,
  shadow: '0 20px 44px rgba(0, 0, 0, 0.32)',
};

function isColorString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function clampRadius(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.min(40, Math.max(0, value));
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return DEFAULT_THEME.radius;
  return Math.min(40, Math.max(0, parsed));
}

function normalizeTheme(raw) {
  const theme = raw && typeof raw === 'object' ? raw : {};
  return {
    primary: isColorString(theme.primary) ? theme.primary : DEFAULT_THEME.primary,
    surface: isColorString(theme.surface) ? theme.surface : DEFAULT_THEME.surface,
    accent: isColorString(theme.accent) ? theme.accent : DEFAULT_THEME.accent,
    radius: clampRadius(theme.radius ?? DEFAULT_THEME.radius),
    shadow: typeof theme.shadow === 'string' && theme.shadow.trim()
      ? theme.shadow
      : DEFAULT_THEME.shadow,
  };
}

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const value = hex.trim();
  if (!value.startsWith('#')) return null;
  const normalized = value.slice(1);
  if (![3, 6].includes(normalized.length)) return null;
  const expand = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
  const int = parseInt(expand, 16);
  if (Number.isNaN(int)) return null;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return { r, g, b };
}

function rgbaFromColor(value, alpha) {
  const rgb = hexToRgb(value);
  if (rgb) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }
  return value;
}

function mixWithWhite(value, ratio = 0.15) {
  const rgb = hexToRgb(value);
  if (!rgb) return value;
  const clampRatio = Math.min(1, Math.max(0, ratio));
  const mix = (channel) => Math.round(channel + (255 - channel) * clampRatio);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

function themeToCssVars(theme) {
  const normalized = normalizeTheme(theme);
  return {
    '--section-primary': normalized.primary,
    '--section-primary-soft': rgbaFromColor(normalized.primary, 0.2),
    '--section-surface': normalized.surface,
    '--section-surface-elevated': mixWithWhite(normalized.surface, 0.08),
    '--section-accent': normalized.accent,
    '--section-accent-soft': rgbaFromColor(normalized.accent, 0.24),
    '--section-radius': `${normalized.radius}px`,
    '--section-shadow': normalized.shadow,
    '--section-border': mixWithWhite(normalized.surface, 0.3),
  };
}

function sortEntries(entries = []) {
  const list = Array.isArray(entries) ? [...entries] : [];
  return list.sort((a, b) => {
    const aKey = a?.createdAt || a?.updatedAt || `${a?.date ?? ''}T00:00:00`;
    const bKey = b?.createdAt || b?.updatedAt || `${b?.date ?? ''}T00:00:00`;
    return aKey > bKey ? -1 : aKey < bKey ? 1 : 0;
  });
}

function renderEntryHtml(entry) {
  if (entry?.html && entry.html.trim()) return entry.html;
  if (typeof entry?.content === 'string' && /<[^>]+>/.test(entry.content)) return entry.content;
  return (entry?.text ?? '').replace(/\n/g, '<br/>');
}

function formatUpdatedAt(value) {
  if (!value) return 'Never updated';
  try {
    const updated = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(updated.getTime())) return 'Updated recently';

    const now = Date.now();
    const diffMs = updated.getTime() - now;
    const diffMinutes = Math.round(diffMs / 60000);
    const absMinutes = Math.abs(diffMinutes);

    if (absMinutes < 1) return 'Updated just now';
    if (absMinutes < 60) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return `Updated ${rtf.format(diffMinutes, 'minute')}`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return `Updated ${rtf.format(diffHours, 'hour')}`;
    }

    const diffDays = Math.round(diffHours / 24);
    if (Math.abs(diffDays) < 30) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return `Updated ${rtf.format(diffDays, 'day')}`;
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

function normalizeSection(raw) {
  if (!raw) return null;
  const slug = (raw.slug || raw.key || '').toLowerCase();
  if (!slug) return null;
  return {
    ...raw,
    id: raw.id || raw._id,
    slug,
    key: slug,
    title: raw.title || raw.label || raw.name || 'Untitled section',
    icon: raw.icon || raw.emoji || '📚',
    description: typeof raw.description === 'string' ? raw.description : '',
    layout: raw.layout || 'flow',
    theme: normalizeTheme(raw.theme),
    public: Boolean(raw.public),
    color: raw.color || raw.themeColor || 'var(--color-thread, #6b6bff)',
    tagline: raw.tagline || raw.subtitle || '',
    summary: raw.summary || raw.description || '',
    updatedAt: raw.updatedAt || raw.updated_at || null,
    createdAt: raw.createdAt || raw.created_at || null,
  };
}

export default function SectionPage() {
  const navigate = useNavigate();
  const params = useParams();
  const initialKey = (params.key || params.sectionName || '').toLowerCase();
  const { token } = useContext(AuthContext);

  const [sections, setSections] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [activeKey, setActiveKey] = useState(initialKey);
  const [draft, setDraft] = useState(null);
  const [updating, setUpdating] = useState({});
  const [themeDraft, setThemeDraft] = useState(DEFAULT_THEME);
  const [themeDirty, setThemeDirty] = useState(false);

  useEffect(() => {
    setActiveKey(initialKey);
  }, [initialKey]);

  useEffect(() => {
    if (!token) {
      setSections([]);
      setEntries([]);
      setDraft(null);
      setLoadingSections(false);
      setLoadingEntries(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    async function loadSections() {
      setLoadingSections(true);
      try {
        const res = await axios.get('/api/sections');
        if (ignore) return;
        const list = Array.isArray(res.data) ? res.data : [];
        const normalized = list.map(normalizeSection).filter(Boolean);
        setSections(normalized);
        setFetchError('');
      } catch (err) {
        if (ignore) return;
        console.warn('Section list failed:', err?.response?.data || err.message);
        setSections([]);
        setFetchError(err?.response?.data?.error || 'Failed to load sections');
      } finally {
        if (!ignore) setLoadingSections(false);
      }
    }

    loadSections();
    return () => {
      ignore = true;
    };
  }, [token]);

  const activeSection = useMemo(() => {
    if (!activeKey) return null;
    return sections.find((s) => s.key === activeKey) || null;
  }, [sections, activeKey]);

  useEffect(() => {
    if (!activeSection && sections.length > 0 && !loadingSections) {
      const fallback = sections[0];
      setActiveKey(fallback?.key || '');
      if (fallback?.key) {
        navigate(`/sections/${encodeURIComponent(fallback.key)}`, { replace: true });
      }
    }
  }, [activeSection, sections, loadingSections, navigate]);

  useEffect(() => {
    if (activeSection) {
      setDraft({
        id: activeSection.id,
        key: activeSection.key,
        title: activeSection.title,
        icon: activeSection.icon,
        description: activeSection.description,
        layout: activeSection.layout,
        theme: normalizeTheme(activeSection.theme),
        public: activeSection.public,
      });
      setThemeDraft(normalizeTheme(activeSection.theme));
      setThemeDirty(false);
      setSaveError('');
    } else {
      setDraft(null);
      setThemeDraft(DEFAULT_THEME);
      setThemeDirty(false);
    }
  }, [activeSection]);

  useEffect(() => {
    if (!token || !activeSection) {
      setEntries([]);
      return;
    }

    let ignore = false;

    async function loadEntries() {
      setLoadingEntries(true);
      try {
        const res = await axios.get(`/api/entries?section=${encodeURIComponent(activeSection.slug)}&limit=100`);
        if (ignore) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setEntries(list);
      } catch (err) {
        if (ignore) return;
        console.warn('Section entries failed:', err?.response?.data || err.message);
        setEntries([]);
      } finally {
        if (!ignore) setLoadingEntries(false);
      }
    }

    loadEntries();
    return () => {
      ignore = true;
    };
  }, [token, activeSection]);

  const sortedEntries = useMemo(() => sortEntries(entries), [entries]);

  const handleSelectSection = useCallback(
    (section) => {
      if (!section?.key) return;
      setActiveKey(section.key);
      navigate(`/sections/${encodeURIComponent(section.key)}`);
    },
    [navigate],
  );

  const handleUpdate = useCallback(
    async (patch) => {
      if (!activeSection?.id || !patch || Object.keys(patch).length === 0) return false;
      const keys = Object.keys(patch);
      const snapshot = activeSection;
      setUpdating((prev) => {
        const next = { ...prev };
        keys.forEach((key) => {
          next[key] = true;
        });
        return next;
      });
      setSaveError('');
      try {
        const res = await axios.put(`/api/sections/${activeSection.id}`, patch);
        const updated = normalizeSection(res.data);
        if (updated) {
          setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          setDraft((prev) => (prev ? { ...prev, ...updated } : prev));
          return true;
        }
      } catch (err) {
        console.warn('Update section failed:', err?.response?.data || err.message);
        setSaveError(err?.response?.data?.error || 'Unable to save section changes');
        setDraft((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          keys.forEach((key) => {
            next[key] = snapshot[key];
          });
          return next;
        });
        return false;
      } finally {
        setUpdating((prev) => {
          const next = { ...prev };
          keys.forEach((key) => {
            delete next[key];
          });
          return next;
        });
      }
      return false;
    },
    [activeSection],
  );

  const handleIconChange = useCallback(() => {
    if (!draft) return;
    const nextIcon = window.prompt('Choose an emoji or short icon for this section', draft.icon || '📚');
    if (nextIcon == null) return;
    const trimmed = nextIcon.trim();
    if (!trimmed || trimmed === draft.icon) return;
    setDraft((prev) => (prev ? { ...prev, icon: trimmed } : prev));
    handleUpdate({ icon: trimmed });
  }, [draft, handleUpdate]);

  const handleTitleBlur = useCallback(() => {
    if (!draft || !activeSection) return;
    const trimmed = draft.title.trim();
    if (!trimmed) {
      setDraft((prev) => (prev ? { ...prev, title: activeSection.title } : prev));
      return;
    }
    if (trimmed === activeSection.title) return;
    handleUpdate({ title: trimmed });
  }, [draft, activeSection, handleUpdate]);

  const handleDescriptionBlur = useCallback(() => {
    if (!draft || !activeSection) return;
    const value = draft.description || '';
    if (value === (activeSection.description || '')) return;
    handleUpdate({ description: value });
  }, [draft, activeSection, handleUpdate]);

  const handleLayoutSelect = useCallback(
    (layout) => {
      if (!draft || draft.layout === layout) return;
      setDraft((prev) => (prev ? { ...prev, layout } : prev));
      handleUpdate({ layout });
    },
    [draft, handleUpdate],
  );

  const handleThemeEdit = useCallback(() => {
    const el = document.getElementById('settings');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.focus?.();
    }
  }, []);

  const handlePublicToggle = useCallback(() => {
    if (!draft) return;
    const nextValue = !draft.public;
    setDraft((prev) => (prev ? { ...prev, public: nextValue } : prev));
    handleUpdate({ public: nextValue });
  }, [draft, handleUpdate]);

  const handleThemeFieldChange = useCallback((field, value) => {
    const nextValue = field === 'radius' ? clampRadius(value) : value;
    setThemeDraft((prev) => {
      if (prev[field] === nextValue) return prev;
      const nextTheme = { ...prev, [field]: nextValue };
      setDraft((current) => {
        if (!current) return current;
        const baseTheme = current.theme && typeof current.theme === 'object' ? current.theme : {};
        return { ...current, theme: { ...baseTheme, [field]: nextValue } };
      });
      setThemeDirty(true);
      return nextTheme;
    });
  }, []);

  const handleThemeRevert = useCallback(() => {
    if (!activeSection) return;
    const normalized = normalizeTheme(activeSection.theme);
    setThemeDraft(normalized);
    setDraft((prev) => (prev ? { ...prev, theme: normalized } : prev));
    setThemeDirty(false);
  }, [activeSection]);

  const handleThemeSave = useCallback(async () => {
    if (!themeDirty) return;
    const payload = normalizeTheme(themeDraft);
    const success = await handleUpdate({ theme: payload });
    if (success) {
      setThemeDraft(payload);
      setDraft((prev) => (prev ? { ...prev, theme: payload } : prev));
      setThemeDirty(false);
    }
  }, [themeDraft, themeDirty, handleUpdate]);

  const entriesLoading = loadingEntries;
  const appliedTheme = activeSection ? themeDraft : DEFAULT_THEME;
  const themeVars = useMemo(() => themeToCssVars(appliedTheme), [appliedTheme]);

  return (
    <div className="sections-page sections-detail-mode" style={themeVars}>
      <aside className="sections-sidebar">
        <div className="sidebar-head">
          <h2>Sections</h2>
          <span className="sidebar-count">{loadingSections ? '…' : sections.length}</span>
        </div>

        {fetchError && <div className="callout error">{fetchError}</div>}
        {loadingSections && !fetchError && <div className="muted">Loading…</div>}

        {!loadingSections && sections.length === 0 && (
          <div className="empty">No sections yet. Create one from the index page.</div>
        )}

        <ul className="section-list">
          {sections.map((section) => {
            const active = section.key === activeSection?.key;
            return (
              <li key={section.key} className={`section-item ${active ? 'active' : ''}`}>
                <button type="button" className="section-link" onClick={() => handleSelectSection(section)}>
                  <span className="color-dot" style={{ background: section.color }} />
                  <span className="icon">{section.icon}</span>
                  <span className="label">{section.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="sections-main">
        {!activeSection && !loadingSections && (
          <div className="sections-landing">
            <div className="sections-hero">
              <h1>Select a section to get started</h1>
              <p>Choose a section from the left rail to configure its overview, entries, and tasks.</p>
            </div>
          </div>
        )}

        {activeSection && draft && (
          <>
            <header className="section-hero" data-sticky-context>
              <div className="section-identity">
                <button type="button" className="section-icon" onClick={handleIconChange} aria-label="Edit section icon">
                  <span aria-hidden="true">{draft.icon}</span>
                </button>
                <div className="section-title-group">
                  <input
                    className="section-title-input"
                    value={draft.title}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                    onBlur={handleTitleBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Untitled section"
                    aria-label="Section title"
                  />
                  <span className="section-updated">{formatUpdatedAt(activeSection.updatedAt)}</span>
                </div>
              </div>

              <div className="section-description">
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                  onBlur={handleDescriptionBlur}
                  placeholder="Describe this section"
                  rows={Math.max(2, Math.min(6, draft.description.split('\n').length + 1))}
                  aria-label="Section description"
                />
              </div>

              <div className="section-controls">
                <div className="layout-picker" role="radiogroup" aria-label="Layout">
                  {LAYOUT_OPTIONS.map((option) => {
                    const active = draft.layout === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`layout-pill ${active ? 'active' : ''}`}
                        onClick={() => handleLayoutSelect(option.value)}
                        disabled={!!updating.layout && draft.layout === option.value}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <button type="button" className="theme-chip" onClick={handleThemeEdit}>
                  <span className="dot" aria-hidden="true" />
                  Edit theme
                </button>

                <button
                  type="button"
                  className={`public-toggle ${draft.public ? 'is-public' : ''}`}
                  onClick={handlePublicToggle}
                >
                  <span className="toggle-thumb" aria-hidden="true" />
                  <span>{draft.public ? 'Public view on' : 'Public view off'}</span>
                </button>
              </div>
            </header>

            <nav className="section-subnav" aria-label="Section navigation">
              {SUBNAV_LINKS.map((link) => (
                <a key={link.id} href={`#${link.id}`} className="subnav-link">
                  {link.label}
                </a>
              ))}
            </nav>

            {saveError && <div className="callout error">{saveError}</div>}

            <section id="overview" className="section-panel">
              <header>
                <h2>Overview</h2>
                <p className="muted">Build your section with modules to spotlight the work that matters.</p>
              </header>
              <div className="modules-placeholder">
                <div className="empty">
                  <strong>No modules yet</strong>
                  <p>Add cards, lists, or charts to craft your section dashboard.</p>
                  <button type="button" className="cta" disabled>
                    Add Module
                  </button>
                  <span className="muted">Module library coming soon.</span>
                </div>
              </div>
            </section>

            <section id="entries" className="section-panel">
              <header>
                <h2>Entries</h2>
                <p className="muted">Recent reflections and journal notes captured in this section.</p>
              </header>

              {entriesLoading && <div className="muted">Loading entries…</div>}
              {!entriesLoading && sortedEntries.length === 0 && (
                <div className="empty">No entries yet. Capture your first reflection for this section.</div>
              )}

              {!entriesLoading && sortedEntries.length > 0 && (
                <div className="entries-stack">
                  {sortedEntries.map((entry) => (
                    <article key={entry._id} className="entry-card">
                      <div className="entry-meta">
                        <span className="date">{entry.date}</span>
                        {entry.mood && <span className="pill">{entry.mood}</span>}
                        {Array.isArray(entry.tags) &&
                          entry.tags.slice(0, 5).map((tag, idx) => (
                            <span key={idx} className="pill pill-muted">#{tag}</span>
                          ))}
                      </div>
                      <SafeHTML className="entry-text" html={renderEntryHtml(entry)} />
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section id="tasks" className="section-panel">
              <header>
                <h2>Tasks</h2>
                <p className="muted">Upcoming tasks associated with this section.</p>
              </header>
              <div className="tasks-panel">
                <TaskList
                  view="upcoming"
                  header="Upcoming tasks"
                  section={activeSection.slug}
                  wrap={false}
                />
              </div>
            </section>

            <section id="settings" className="section-panel" tabIndex={-1}>
              <header>
                <h2>Settings</h2>
                <p className="muted">Fine-tune slug, sharing, and metadata.</p>
              </header>
              <dl className="section-metadata">
                <div>
                  <dt>Slug</dt>
                  <dd>{activeSection.slug}</dd>
                </div>
                <div>
                  <dt>Layout</dt>
                  <dd className="muted">{draft.layout}</dd>
                </div>
                <div>
                  <dt>Visibility</dt>
                  <dd className="muted">{draft.public ? 'Public' : 'Private'}</dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd className="muted">
                    {activeSection.updatedAt
                      ? new Date(activeSection.updatedAt).toLocaleString()
                      : 'Not available'}
                  </dd>
                </div>
              </dl>

              <div className="theme-editor" aria-live="polite">
                <div className="theme-editor-head">
                  <h3>Theme editor</h3>
                  {themeDirty && <span className="badge">Unsaved changes</span>}
                </div>
                <p className="muted">
                  Tune the colors, surface, and depth for this section. Changes preview instantly for you.
                </p>

                <div className="theme-grid">
                  <label className="theme-field">
                    <span>Primary</span>
                    <input
                      type="color"
                      value={themeDraft.primary}
                      onChange={(e) => handleThemeFieldChange('primary', e.target.value)}
                      aria-label="Primary color"
                    />
                  </label>

                  <label className="theme-field">
                    <span>Surface</span>
                    <input
                      type="color"
                      value={themeDraft.surface}
                      onChange={(e) => handleThemeFieldChange('surface', e.target.value)}
                      aria-label="Surface color"
                    />
                  </label>

                  <label className="theme-field">
                    <span>Accent</span>
                    <input
                      type="color"
                      value={themeDraft.accent}
                      onChange={(e) => handleThemeFieldChange('accent', e.target.value)}
                      aria-label="Accent color"
                    />
                  </label>

                  <label className="theme-field">
                    <span>Corner radius</span>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      step="1"
                      value={themeDraft.radius}
                      onChange={(e) => handleThemeFieldChange('radius', Number(e.target.value))}
                      aria-label="Corner radius"
                    />
                    <output>{Math.round(themeDraft.radius)}px</output>
                  </label>

                  <label className="theme-field theme-field-wide">
                    <span>Shadow</span>
                    <input
                      type="text"
                      value={themeDraft.shadow}
                      onChange={(e) => handleThemeFieldChange('shadow', e.target.value)}
                      placeholder="CSS box-shadow"
                      aria-label="Shadow"
                    />
                  </label>
                </div>

                <div className="theme-actions">
                  <button type="button" className="btn ghost" onClick={handleThemeRevert} disabled={!themeDirty}>
                    Revert
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleThemeSave}
                    disabled={!themeDirty || updating.theme}
                  >
                    {updating.theme ? 'Saving…' : 'Save theme'}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {token && (
        <aside className="sections-rail">
          <TaskList view="today" section={activeSection?.slug || undefined} header="Today" />
        </aside>
      )}
    </div>
  );
}
