// frontend/src/components/CreateClusterModal.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '../AuthContext.jsx';
import { makeApi } from '../utils/api.js';
import { normalizeCluster, slugifyCluster } from '../utils/clusterHelpers.js';

export default function CreateClusterModal({ onClose, onCreated }) {
  const { token } = useContext(AuthContext);
  const api = useMemo(() => makeApi(token), [token]);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [icon, setIcon] = useState('🌱');
  const [color, setColor] = useState('#9b87f5');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const labelRef = useRef(null);
  useEffect(() => { labelRef.current?.focus(); }, []);

  // Auto-generate `key` from label unless user has touched key field
  useEffect(() => {
    if (!slugDirty) setSlug(slugifyCluster(name));
  }, [name, slugDirty]);

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    const cleanName = name.trim();
    const cleanSlug = slugifyCluster(slug);

    if (!cleanName) return setErr('Name is required.');
    if (!cleanSlug) return setErr('Slug is required.');

    setSaving(true);
    try {
      const payload = {
        name: cleanName,
        slug: cleanSlug,
        color,
        icon: icon || undefined
      };
      const res = await api.post('/api/clusters', payload);
      const doc = res?.data || null;          // our api helper unwraps to {data: ...}
      const created = doc?.data || doc;       // tolerate either shape
      if (!created?._id) throw new Error('Unexpected response');

      onCreated && onCreated(normalizeCluster(created) || created);
      onClose && onClose();
    } catch (e2) {
      if (String(e2?.message || '').includes('409') || /exists/i.test(e2?.message || '')) {
        setErr('That key already exists. Try a different one.');
      } else {
        setErr(e2?.message || 'Failed to create cluster.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-cluster-title">
      <div className="modal">
        <div className="modal-head">
          <h3 id="create-cluster-title">New Cluster</h3>
          <button className="btn icon" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit} className="form-grid">
          <label className="field">
            <span>Name</span>
            <input
              ref={labelRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Home, Studio, Garden…"
              required
            />
          </label>

          <label className="field">
            <span>Slug (URL-safe)</span>
            <input
              type="text"
              value={slug}
              onChange={e => { setSlugDirty(true); setSlug(slugifyCluster(e.target.value)); }}
              placeholder="home"
              required
            />
            <small className="hint">Used in the URL: <code>/clusters/{slug || 'slug'}</code></small>
          </label>

          <div className="row">
            <label className="field">
              <span>Icon</span>
              <input
                type="text"
                value={icon}
                onChange={e => setIcon(e.target.value)}
                placeholder="🌱"
              />
            </label>
            <label className="field">
              <span>Color</span>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                aria-label="Color"
              />
            </label>
          </div>

          {err && <div className="form-error">{err}</div>}

          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn" disabled={saving || !name || !slug}>
              {saving ? 'Creating…' : 'Create Cluster'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
