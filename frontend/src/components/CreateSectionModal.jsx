// frontend/src/components/CreateSectionModal.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '../AuthContext.jsx';
import { makeApi } from '../utils/api.js';

function slugify(label) {
  return (label || '')
    .toLowerCase().trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export default function CreateSectionModal({ onClose, onCreated }) {
  const { token } = useContext(AuthContext);
  const api = useMemo(() => makeApi(token), [token]);

  const [label, setLabel] = useState('');
  const [keyVal, setKeyVal] = useState('');
  const [keyDirty, setKeyDirty] = useState(false);
  const [icon, setIcon] = useState('📚');
  const [color, setColor] = useState('#5cc2ff');
  const [description, setDescription] = useState('');
  const [pinned, setPinned] = useState(true);
  const [order, setOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const labelRef = useRef(null);
  useEffect(() => { labelRef.current?.focus(); }, []);
  useEffect(() => { if (!keyDirty) setKeyVal(slugify(label)); }, [label, keyDirty]);

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    if (!label.trim()) return setErr('Label is required.');
    if (!keyVal.trim()) return setErr('Key is required.');
    setSaving(true);
    try {
      const payload = { key: keyVal.trim(), label: label.trim(), color, icon, description, pinned, order: +order || 0 };
      const res = await api.post('/api/sections', payload);
      const doc = res?.data || res;
      const created = doc?.data || doc;
      if (!created?._id) throw new Error('Unexpected response');
      onCreated && onCreated(created);
      onClose && onClose();
    } catch (e2) {
      if (String(e2?.message || '').includes('409') || /exists/i.test(e2?.message || '')) {
        setErr('That key already exists. Try another.');
      } else {
        setErr(e2?.message || 'Failed to create section.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-section-title">
      <div className="modal">
        <div className="modal-head">
          <h3 id="create-section-title">New Section</h3>
          <button className="btn icon" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit} className="form-grid">
          <label className="field">
            <span>Label</span>
            <input ref={labelRef} type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Inbox, Projects, Study…" required />
          </label>

          <label className="field">
            <span>Key (URL-safe)</span>
            <input
              type="text"
              value={keyVal}
              onChange={e => { setKeyDirty(true); setKeyVal(slugify(e.target.value)); }}
              placeholder="inbox"
              required
            />
            <small className="hint">URL: <code>/sections/{keyVal || 'key'}</code></small>
          </label>

          <div className="row">
            <label className="field"><span>Icon</span><input type="text" value={icon} onChange={e => setIcon(e.target.value)} placeholder="📚" /></label>
            <label className="field"><span>Color</span><input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
            <label className="field"><span>Order</span><input type="number" value={order} onChange={e => setOrder(parseInt(e.target.value, 10))} min={-999} max={999} /></label>
          </div>

          <label className="field">
            <span>Description</span>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="What lives in this section?" />
          </label>

          <label className="check">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
            <span>Pin to top</span>
          </label>

          {err && <div className="form-error">{err}</div>}

          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn" disabled={saving || !label || !keyVal}>{saving ? 'Creating…' : 'Create Section'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
