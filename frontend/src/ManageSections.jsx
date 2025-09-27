// src/ManageSections.jsx
import { useState, useEffect, useContext, useMemo } from 'react';
import axios from './api/axiosInstance.js';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import './Main.css';

function slugifyKey(s = '') {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeSection(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    id: s._id || s.id || undefined,
    key: s.key || s.slug || slugifyKey(s.label || s.name || ''),
    label: s.label || s.name || s.key || '',
    icon: s.icon || s.emoji || '📚',
    pinned: !!s.pinned,
    order: Number.isFinite(s.order) ? s.order : 0,
    description: s.description || '',
    color: s.color || '#9b87f5',
  };
}

export default function ManageSections() {
  const { token, isAuthenticated } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opMsg, setOpMsg] = useState('');

  // Create form
  const [newLabel, setNewLabel] = useState('');
  const [newIcon, setNewIcon] = useState('📚');
  const [creating, setCreating] = useState(false);

  // Edit row state
  const [editKey, setEditKey] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editIcon, setEditIcon] = useState('📚');
  const [editPinned, setEditPinned] = useState(false);
  const [editOrder, setEditOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => {
    return [...sections].sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;
      if (a.order !== b.order) return a.order - b.order;
      return (a.label || a.key).localeCompare(b.label || b.key);
    });
  }, [sections]);

  function note(msg) {
    setOpMsg(msg);
    setTimeout(() => setOpMsg(''), 1500);
  }

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/sections', { headers });
      const list = Array.isArray(res.data)
        ? res.data.map(normalizeSection).filter(Boolean)
        : [];
      setSections(list);
    } catch (e) {
      console.warn('Failed to load sections', e?.response?.data || e.message);
      setSections([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  /* ------------------------ Create ------------------------ */
  async function createSection(e) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const key = slugifyKey(label);
    setCreating(true);
    try {
      const body = { key, label, icon: newIcon, pinned: true, order: 0 };
      const res = await axios.post('/api/sections', body, { headers });
      const created = normalizeSection(res.data) || { ...body, id: res.data?._id };
      setSections(prev => [...prev, created]);
      setNewLabel('');
      setNewIcon('📚');
      note('Section created');
    } catch (e) {
      console.warn('Create failed', e?.response?.data || e.message);
      alert(e?.response?.data?.error || 'Could not create section');
    } finally {
      setCreating(false);
    }
  }

  /* ------------------------ Edit/Save ------------------------ */
  function beginEdit(s) {
    setEditKey(s.key);
    setEditLabel(s.label);
    setEditIcon(s.icon || '📚');
    setEditPinned(!!s.pinned);
    setEditOrder(Number.isFinite(s.order) ? s.order : 0);
  }

  function cancelEdit() {
    setEditKey(null);
    setEditLabel('');
    setEditIcon('📚');
    setEditPinned(false);
    setEditOrder(0);
  }

  async function saveEdit(original) {
    const nextLabel = editLabel.trim();
    if (!nextLabel) return;
    const maybeNewKey = slugifyKey(nextLabel);
    setSaving(true);

    try {
      const body = { label: nextLabel, icon: editIcon, pinned: editPinned, order: editOrder };
      if (maybeNewKey !== original.key) body.key = maybeNewKey;

      const res = await axios.patch(`/api/sections/${encodeURIComponent(original.id)}`, body, { headers });
      const updated = normalizeSection(res.data) || {
        ...original,
        ...body,
        key: body.key || original.key,
      };
      setSections(prev => prev.map(s => (s.key === original.key ? updated : s)));
      note('Saved');
      cancelEdit();
    } catch (errModern) {
      console.warn('Update failed', errModern?.response?.data || errModern.message);
      alert(errModern?.response?.data?.error || 'Could not save section');
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------ Delete ------------------------ */
  async function removeSection(s) {
    const warn = `Delete “${s.label}”? This may remove or orphan associated entries/pages.`;
    if (!window.confirm(warn)) return;
    try {
      await axios.delete(`/api/sections/${encodeURIComponent(s.id || s._id || s.key)}`, { headers });
      setSections(prev => prev.filter(x => x.key !== s.key));
      note('Deleted');
    } catch (e) {
      console.warn('Delete failed', e?.response?.data || e.message);
      alert(e?.response?.data?.error || 'Could not delete section');
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
      <div className="page" style={{ padding: 16 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Manage Sections</h2>
            {opMsg && <span className="pill">{opMsg}</span>}
          </div>

          {/* Create */}
          <form onSubmit={createSection} style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop: 8 }}>
            <input
              className="input"
              placeholder="New section label (e.g., Crochet, Games)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              style={{ minWidth: 220, flex: 1 }}
              required
            />
            <input
              className="input"
              placeholder="Icon (emoji)"
              value={newIcon}
              onChange={e => setNewIcon(e.target.value)}
              style={{ width: 90, textAlign:'center' }}
              aria-label="Section icon"
            />
            <button className="button" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="card">
          {sorted.length === 0 ? (
            <p className="muted">No sections yet.</p>
          ) : (
            <ul className="unstyled" style={{ display:'grid', gap: 8 }}>
              {sorted.map(s => {
                const editing = editKey === s.key;
                return (
                  <li
                    key={s.key}
                    className="section-item"
                    style={{
                      display:'grid',
                      gridTemplateColumns:'minmax(80px,120px) 1fr 110px 90px auto',
                      gap: 8,
                      alignItems:'center',
                      padding:'10px 12px',
                      border:'1px solid var(--color-border,#2a2a32)',
                      borderRadius:12,
                      background:'var(--card,rgba(255,255,255,.02))'
                    }}
                  >
                    {/* Icon */}
                    {editing ? (
                      <input
                        className="input"
                        value={editIcon}
                        onChange={e => setEditIcon(e.target.value)}
                        aria-label="Icon"
                      />
                    ) : (
                      <div style={{ fontSize: 22 }}>{s.icon}</div>
                    )}

                    {/* Label (and key shown muted) */}
                    <div style={{ overflow:'hidden' }}>
                      {editing ? (
                        <>
                          <input
                            className="input"
                            value={editLabel}
                            onChange={e => setEditLabel(e.target.value)}
                            aria-label="Label"
                          />
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            slug: {slugifyKey(editLabel || s.label)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600 }}>{s.label}</div>
                          <div className="muted" style={{ fontSize: 12 }}>slug: {s.key}</div>
                        </>
                      )}
                    </div>

                    {/* Pinned */}
                    <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Pinned</span>
                      {editing ? (
                        <input
                          type="checkbox"
                          checked={editPinned}
                          onChange={e => setEditPinned(e.target.checked)}
                          aria-label="Pinned"
                        />
                      ) : (
                        <span className={`pill ${s.pinned ? '' : 'pill-muted'}`}>{s.pinned ? 'Yes' : 'No'}</span>
                      )}
                    </div>

                    {/* Order */}
                    <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Order</span>
                      {editing ? (
                        <input
                          className="input"
                          type="number"
                          value={editOrder}
                          onChange={e => setEditOrder(parseInt(e.target.value || '0', 10))}
                          style={{ width: 70 }}
                          aria-label="Order"
                        />
                      ) : (
                        <span className="pill pill-muted">{s.order}</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display:'flex', gap: 6, justifyContent:'flex-end' }}>
                      {editing ? (
                        <>
                          <button
                            className="button"
                            onClick={() => saveEdit(s)}
                            disabled={saving}
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button className="button chip" onClick={cancelEdit} disabled={saving}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="button chip" onClick={() => beginEdit(s)}>Edit</button>
                          <button className="button chip danger" onClick={() => removeSection(s)}>Delete</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
