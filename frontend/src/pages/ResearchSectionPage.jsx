// frontend/src/pages/ResearchSectionPage.jsx
// Genealogy/research project view: list of people + detail panel
import { useState, useEffect, useCallback, useContext } from 'react';
import { useParams } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

// ─── tiny helpers ─────────────────────────────────────────────────────────────

function lifespan(s) {
  const b = s.birthDate ? s.birthDate.replace(/^(\d{4}).*/, '$1') : '?';
  const d = s.deathDate ? s.deathDate.replace(/^(\d{4}).*/, '$1') : '';
  if (!s.deathDate && !s.birthDate) return '';
  return d ? `(${b}–${d})` : `(b. ${b})`;
}

function genderIcon(g) {
  if (g === 'male') return '♂';
  if (g === 'female') return '♀';
  return '';
}

const RELIABILITY_LABELS = {
  primary: 'Primary source',
  secondary: 'Secondary source',
  tertiary: 'Tertiary source',
  unknown: 'Unknown reliability',
};

// ─── SubjectForm ──────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', gender: '', alternateNames: '',
  birthDate: '', birthPlace: '', deathDate: '', deathPlace: '', burialPlace: '',
  occupation: '', notes: '', tags: '',
};

function SubjectForm({ initial = {}, onSave, onCancel, allSubjects = [], subjectId = null }) {
  const [f, setF] = useState({
    ...EMPTY_FORM,
    ...initial,
    alternateNames: (initial.alternateNames || []).join(', '),
    tags: (initial.tags || []).join(', '),
  });
  const [parentIds, setParentIds] = useState(
    (initial.parentIds || []).map(p => p._id || p).filter(Boolean)
  );
  const [spouseIds, setSpouseIds] = useState(
    (initial.spouseIds || []).map(p => p._id || p).filter(Boolean)
  );
  const [sources, setSources] = useState(
    initial.sources || []
  );
  const [saving, setSaving] = useState(false);

  const field = (key) => (e) => setF(prev => ({ ...prev, [key]: e.target.value }));

  function toggleRel(list, setList, id) {
    setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function addSource() {
    setSources(prev => [...prev, { citation: '', url: '', reliability: 'unknown' }]);
  }
  function updateSource(i, key, val) {
    setSources(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  }
  function removeSource(i) {
    setSources(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...f,
        alternateNames: f.alternateNames.split(',').map(s => s.trim()).filter(Boolean),
        tags: f.tags.split(',').map(s => s.trim()).filter(Boolean),
        parentIds,
        spouseIds,
        sources,
      });
    } finally {
      setSaving(false);
    }
  }

  const candidates = allSubjects.filter(s => (s._id || s.id) !== subjectId);

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.formGrid}>
        <label style={styles.label}>Full name *
          <input style={styles.input} value={f.name} onChange={field('name')} required />
        </label>
        <label style={styles.label}>Gender
          <select style={styles.input} value={f.gender} onChange={field('gender')}>
            <option value="">Unknown</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
        <label style={styles.label}>Also known as (comma-separated)
          <input style={styles.input} value={f.alternateNames} onChange={field('alternateNames')} placeholder="Maiden name, nickname…" />
        </label>
        <label style={styles.label}>Occupation
          <input style={styles.input} value={f.occupation} onChange={field('occupation')} />
        </label>
      </div>

      <h4 style={styles.subheading}>Vital records</h4>
      <div style={styles.formGrid}>
        <label style={styles.label}>Birth date
          <input style={styles.input} value={f.birthDate} onChange={field('birthDate')} placeholder="e.g. 14 Mar 1842 or c. 1850" />
        </label>
        <label style={styles.label}>Birth place
          <input style={styles.input} value={f.birthPlace} onChange={field('birthPlace')} placeholder="Town, County, Country" />
        </label>
        <label style={styles.label}>Death date
          <input style={styles.input} value={f.deathDate} onChange={field('deathDate')} placeholder="e.g. 1920 or bef. 1910" />
        </label>
        <label style={styles.label}>Death place
          <input style={styles.input} value={f.deathPlace} onChange={field('deathPlace')} />
        </label>
        <label style={styles.label}>Burial place
          <input style={styles.input} value={f.burialPlace} onChange={field('burialPlace')} />
        </label>
      </div>

      {candidates.length > 0 && (
        <>
          <h4 style={styles.subheading}>Parents</h4>
          <div style={styles.relList}>
            {candidates.map(s => {
              const id = s._id || s.id;
              return (
                <label key={id} style={styles.relItem}>
                  <input type="checkbox" checked={parentIds.includes(id)} onChange={() => toggleRel(parentIds, setParentIds, id)} />
                  {' '}{s.name} {lifespan(s)}
                </label>
              );
            })}
          </div>

          <h4 style={styles.subheading}>Spouses / Partners</h4>
          <div style={styles.relList}>
            {candidates.map(s => {
              const id = s._id || s.id;
              return (
                <label key={id} style={styles.relItem}>
                  <input type="checkbox" checked={spouseIds.includes(id)} onChange={() => toggleRel(spouseIds, setSpouseIds, id)} />
                  {' '}{s.name} {lifespan(s)}
                </label>
              );
            })}
          </div>
        </>
      )}

      <h4 style={styles.subheading}>Sources &amp; citations</h4>
      {sources.map((src, i) => (
        <div key={i} style={styles.sourceRow}>
          <input
            style={{ ...styles.input, flex: 2 }}
            placeholder="Citation (e.g. England Census 1881, piece 123)"
            value={src.citation}
            onChange={e => updateSource(i, 'citation', e.target.value)}
          />
          <input
            style={{ ...styles.input, flex: 1 }}
            placeholder="URL (optional)"
            value={src.url}
            onChange={e => updateSource(i, 'url', e.target.value)}
          />
          <select
            style={{ ...styles.input, flex: 0 }}
            value={src.reliability}
            onChange={e => updateSource(i, 'reliability', e.target.value)}
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="tertiary">Tertiary</option>
            <option value="unknown">Unknown</option>
          </select>
          <button type="button" onClick={() => removeSource(i)} style={styles.btnDanger} title="Remove source">×</button>
        </div>
      ))}
      <button type="button" onClick={addSource} style={styles.btnSecondary}>+ Add source</button>

      <h4 style={styles.subheading}>Research notes</h4>
      <textarea
        style={{ ...styles.input, minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
        value={f.notes}
        onChange={field('notes')}
        placeholder="Markdown supported — hypotheses, open questions, conflicting records…"
      />

      <label style={styles.label}>Tags (comma-separated)
        <input style={styles.input} value={f.tags} onChange={field('tags')} placeholder="immigrant, pioneer, unknown-parents…" />
      </label>

      <div style={styles.formActions}>
        <button type="submit" style={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" style={styles.btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ─── SubjectDetail ────────────────────────────────────────────────────────────

function SubjectDetail({ subject, onEdit, onDelete }) {
  if (!subject) return null;

  const parents = subject.parentIds || [];
  const spouses = subject.spouseIds || [];
  const children = subject.children || [];

  return (
    <div style={styles.detail}>
      <div style={styles.detailHeader}>
        <div>
          <h2 style={{ margin: 0 }}>{subject.name} {genderIcon(subject.gender)}</h2>
          {subject.alternateNames?.length > 0 && (
            <div style={styles.altNames}>aka: {subject.alternateNames.join(', ')}</div>
          )}
          <div style={styles.lifespan}>{lifespan(subject)}</div>
        </div>
        <div style={styles.detailActions}>
          <button style={styles.btnSecondary} onClick={onEdit}>Edit</button>
          <button style={styles.btnDanger} onClick={onDelete}>Delete</button>
        </div>
      </div>

      <table style={styles.factTable}>
        <tbody>
          {subject.birthDate && <tr><th>Born</th><td>{subject.birthDate}{subject.birthPlace && ` — ${subject.birthPlace}`}</td></tr>}
          {subject.deathDate && <tr><th>Died</th><td>{subject.deathDate}{subject.deathPlace && ` — ${subject.deathPlace}`}</td></tr>}
          {subject.burialPlace && <tr><th>Buried</th><td>{subject.burialPlace}</td></tr>}
          {subject.occupation && <tr><th>Occupation</th><td>{subject.occupation}</td></tr>}
        </tbody>
      </table>

      {(parents.length > 0 || spouses.length > 0 || children.length > 0) && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Family</h3>
          {parents.length > 0 && (
            <div style={styles.relGroup}>
              <span style={styles.relLabel}>Parents:</span>
              {parents.map(p => (
                <span key={p._id} style={styles.relChip}>{p.name} {lifespan(p)}</span>
              ))}
            </div>
          )}
          {spouses.length > 0 && (
            <div style={styles.relGroup}>
              <span style={styles.relLabel}>Spouses/Partners:</span>
              {spouses.map(s => (
                <span key={s._id} style={styles.relChip}>{s.name} {lifespan(s)}</span>
              ))}
            </div>
          )}
          {children.length > 0 && (
            <div style={styles.relGroup}>
              <span style={styles.relLabel}>Children:</span>
              {children.map(c => (
                <span key={c._id} style={styles.relChip}>{c.name} {lifespan(c)}</span>
              ))}
            </div>
          )}
        </section>
      )}

      {subject.notes && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Research notes</h3>
          <pre style={styles.notes}>{subject.notes}</pre>
        </section>
      )}

      {subject.sources?.length > 0 && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Sources</h3>
          <ol style={styles.sourceList}>
            {subject.sources.map((src, i) => (
              <li key={i} style={styles.sourceItem}>
                <span>{src.citation}</span>
                {src.url && <a href={src.url} target="_blank" rel="noreferrer" style={styles.sourceLink}> [link]</a>}
                <span style={styles.reliabilityBadge}>{RELIABILITY_LABELS[src.reliability]}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {subject.tags?.length > 0 && (
        <section style={styles.section}>
          <div style={styles.tagList}>
            {subject.tags.map(t => <span key={t} style={styles.tag}>{t}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResearchSectionPage() {
  const { sectionKey } = useParams();
  const { isAuthenticated } = useContext(AuthContext);

  const [subjects, setSubjects] = useState([]);
  const [selected, setSelected] = useState(null);       // full subject with populated rels
  const [view, setView] = useState('list');              // 'list' | 'new' | 'edit'
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load list
  const loadSubjects = useCallback(async (query = '') => {
    if (!isAuthenticated) return;
    try {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const { data } = await axios.get(`/api/research/${sectionKey}/subjects${params}`);
      setSubjects(data.subjects || []);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load research subjects');
    } finally {
      setLoading(false);
    }
  }, [sectionKey, isAuthenticated]);

  useEffect(() => { loadSubjects(); }, [loadSubjects]);

  // Load detail for selected subject
  async function selectSubject(id) {
    try {
      const { data } = await axios.get(`/api/research/${sectionKey}/subjects/${id}`);
      setSelected(data.subject);
      setView('list');
    } catch (e) {
      console.error('Failed to load subject:', e);
    }
  }

  async function handleCreate(body) {
    const { data } = await axios.post(`/api/research/${sectionKey}/subjects`, body);
    setSubjects(prev => [...prev, data.subject].sort((a, b) => a.name.localeCompare(b.name)));
    setSelected(data.subject);
    setView('list');
  }

  async function handleUpdate(body) {
    const { data } = await axios.patch(`/api/research/${sectionKey}/subjects/${selected._id}`, body);
    setSubjects(prev => prev.map(s => s._id === data.subject._id ? data.subject : s));
    // Reload full populated detail
    await selectSubject(data.subject._id);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    await axios.delete(`/api/research/${sectionKey}/subjects/${selected._id}`);
    setSubjects(prev => prev.filter(s => s._id !== selected._id));
    setSelected(null);
    setView('list');
  }

  function handleSearch(e) {
    const val = e.target.value;
    setQ(val);
    if (!val.trim()) { loadSubjects(); return; }
    loadSubjects(val);
  }

  if (loading) return <div style={styles.loading}>Loading research project…</div>;
  if (error) return <div style={styles.error}>{error}</div>;

  return (
    <div style={styles.page}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <input
            style={styles.searchInput}
            type="search"
            placeholder="Search people…"
            value={q}
            onChange={handleSearch}
          />
          <button
            style={styles.btnPrimary}
            onClick={() => { setSelected(null); setView('new'); }}
          >
            + Person
          </button>
        </div>

        {subjects.length === 0 ? (
          <div style={styles.empty}>No people yet. Add someone to start researching.</div>
        ) : (
          <ul style={styles.personList}>
            {subjects.map(s => (
              <li
                key={s._id}
                style={{
                  ...styles.personItem,
                  ...(selected?._id === s._id ? styles.personItemActive : {}),
                }}
                onClick={() => selectSubject(s._id)}
              >
                <div style={styles.personName}>{s.name} {genderIcon(s.gender)}</div>
                <div style={styles.personMeta}>{lifespan(s)}</div>
                {s.tags?.length > 0 && (
                  <div style={styles.personTags}>{s.tags.slice(0, 3).map(t => <span key={t} style={styles.tagSmall}>{t}</span>)}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={styles.main}>
        {view === 'new' && (
          <>
            <h2 style={{ marginTop: 0 }}>Add person</h2>
            <SubjectForm
              allSubjects={subjects}
              onSave={handleCreate}
              onCancel={() => setView('list')}
            />
          </>
        )}
        {view === 'edit' && selected && (
          <>
            <h2 style={{ marginTop: 0 }}>Edit — {selected.name}</h2>
            <SubjectForm
              initial={selected}
              subjectId={selected._id}
              allSubjects={subjects}
              onSave={handleUpdate}
              onCancel={() => setView('list')}
            />
          </>
        )}
        {view === 'list' && !selected && (
          <div style={styles.splash}>
            <div style={styles.splashIcon}>🔬</div>
            <p>Select a person from the list, or add a new one.</p>
            <p style={{ color: 'var(--text-secondary, #888)', fontSize: '0.9em' }}>
              {subjects.length} {subjects.length === 1 ? 'person' : 'people'} in this research project
            </p>
          </div>
        )}
        {view === 'list' && selected && (
          <SubjectDetail
            subject={selected}
            onEdit={() => setView('edit')}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    display: 'flex',
    height: '100%',
    minHeight: 0,
    gap: 0,
    fontFamily: 'inherit',
  },
  sidebar: {
    width: 260,
    minWidth: 220,
    borderRight: '1px solid var(--border-primary, #333)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarHeader: {
    display: 'flex',
    gap: 8,
    padding: '12px 12px 8px',
    borderBottom: '1px solid var(--border-primary, #333)',
  },
  searchInput: {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--border-primary, #444)',
    background: 'var(--bg-secondary, #1e1e1e)',
    color: 'inherit',
    fontSize: '0.9em',
  },
  personList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    flex: 1,
  },
  personItem: {
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-primary, #2a2a2a)',
    transition: 'background 0.1s',
  },
  personItemActive: {
    background: 'var(--accent-primary-dim, rgba(99,102,241,0.15))',
    borderLeft: '3px solid var(--accent-primary, #6366f1)',
  },
  personName: { fontWeight: 600, fontSize: '0.95em' },
  personMeta: { fontSize: '0.8em', color: 'var(--text-secondary, #888)', marginTop: 2 },
  personTags: { display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  tagSmall: {
    fontSize: '0.7em',
    background: 'var(--bg-tertiary, #2a2a2a)',
    borderRadius: 3,
    padding: '1px 5px',
    color: 'var(--text-secondary, #aaa)',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: '24px 28px',
  },
  splash: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60%',
    color: 'var(--text-secondary, #888)',
    textAlign: 'center',
  },
  splashIcon: { fontSize: '3rem', marginBottom: 12 },
  detail: { maxWidth: 700 },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  detailActions: { display: 'flex', gap: 8 },
  altNames: { color: 'var(--text-secondary, #888)', fontSize: '0.9em', marginTop: 4 },
  lifespan: { color: 'var(--text-secondary, #999)', fontSize: '0.85em', marginTop: 2 },
  factTable: {
    borderCollapse: 'collapse',
    marginBottom: 20,
    width: '100%',
  },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: '0.85em',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-secondary, #888)',
    marginBottom: 8,
    borderBottom: '1px solid var(--border-primary, #333)',
    paddingBottom: 4,
  },
  relGroup: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  relLabel: { fontSize: '0.85em', color: 'var(--text-secondary, #888)', minWidth: 80 },
  relChip: {
    background: 'var(--bg-tertiary, #2a2a2a)',
    borderRadius: 12,
    padding: '2px 10px',
    fontSize: '0.85em',
  },
  notes: {
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    fontSize: '0.95em',
    lineHeight: 1.6,
    margin: 0,
  },
  sourceList: { paddingLeft: 20, margin: 0 },
  sourceItem: { marginBottom: 6, fontSize: '0.9em', lineHeight: 1.5 },
  sourceLink: { color: 'var(--accent-primary, #6366f1)', marginLeft: 4 },
  reliabilityBadge: {
    marginLeft: 8,
    fontSize: '0.75em',
    background: 'var(--bg-tertiary, #2a2a2a)',
    borderRadius: 3,
    padding: '1px 6px',
    color: 'var(--text-secondary, #aaa)',
  },
  tagList: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tag: {
    background: 'var(--bg-tertiary, #2a2a2a)',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: '0.8em',
    color: 'var(--text-secondary, #ccc)',
  },
  // form
  form: { display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 680 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85em', color: 'var(--text-secondary, #aaa)' },
  input: {
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid var(--border-primary, #444)',
    background: 'var(--bg-secondary, #1e1e1e)',
    color: 'inherit',
    fontSize: '0.95em',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  },
  subheading: {
    fontSize: '0.8em',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--text-secondary, #888)',
    margin: '12px 0 6px',
  },
  relList: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  relItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9em', cursor: 'pointer' },
  sourceRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 },
  formActions: { display: 'flex', gap: 10, marginTop: 12 },
  btnPrimary: {
    padding: '7px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent-primary, #6366f1)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9em',
    whiteSpace: 'nowrap',
  },
  btnSecondary: {
    padding: '7px 14px',
    borderRadius: 6,
    border: '1px solid var(--border-primary, #444)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '0.9em',
    whiteSpace: 'nowrap',
  },
  btnDanger: {
    padding: '5px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--danger, #ef4444)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.85em',
  },
  loading: { padding: 40, color: 'var(--text-secondary, #888)' },
  error: { padding: 40, color: 'var(--danger, #ef4444)' },
  empty: { padding: '20px 14px', color: 'var(--text-secondary, #888)', fontSize: '0.9em' },
};
