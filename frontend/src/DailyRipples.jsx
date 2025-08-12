// src/DailyRipples.jsx
import React, { useEffect, useState, useContext, useMemo } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './DailyRipples.css';

/* --- tiny helpers --- */
const uniq = (arr) => [...new Set(arr.filter(Boolean).map(String))];
const norm = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/* --- pill multi-select --- */
function ClusterChips({ allClusters, value, onChange }) {
  const [input, setInput] = useState('');

  const toggle = (name) => {
    const set = new Set(value);
    set.has(name) ? set.delete(name) : set.add(name);
    onChange([...set]);
  };

  const addFromInput = (e) => {
    e.preventDefault();
    const name = input.trim();
    if (!name) return;
    onChange(uniq([...value, name]));
    setInput('');
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {allClusters.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => toggle(c)}
          className={`chip ${value.includes(c) ? 'chip--active' : ''}`}
          title={value.includes(c) ? 'Remove' : 'Add'}
        >
          {c}
        </button>
      ))}

      <form onSubmit={addFromInput} className="inline-flex">
        <input
          className="chip-input"
          placeholder="+ Add cluster"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </form>
    </div>
  );
}

function DailyRipples({ date }) {
  const { token } = useContext(AuthContext);
  const [ripples, setRipples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState([]); // list of cluster names
  const [selected, setSelected] = useState({}); // rippleId -> string[]

  /* auth header memo */
  const authHeader = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  /* load clusters once */
  useEffect(() => {
    let mounted = true;
    axios
      .get('/api/clusters', { headers: authHeader })
      .then((res) => {
        // accept either { name } objects or plain strings
        const names = (res.data || []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
        if (mounted) setClusters(uniq(names));
      })
      .catch(() => {}) // clusters optional
    return () => { mounted = false; };
  }, [authHeader]);

  /* load ripples for date */
  useEffect(() => {
    if (!date) return;
    setLoading(true);
    axios
      .get(`/api/ripples/${date}`, { headers: authHeader })
      .then((res) => {
        const items = res.data || [];
        setRipples(items);
        // seed selected map from ripple.assignedClusters / assignedCluster
        const seed = {};
        for (const r of items) {
          const base = uniq([
            ...(norm(r.assignedClusters)),
            ...(r.assignedCluster ? [r.assignedCluster] : []),
          ]);
          seed[r._id] = base;
        }
        setSelected(seed);
      })
      .catch((err) => console.error('❌ Failed to load daily ripples:', err))
      .finally(() => setLoading(false));
  }, [date, authHeader]);

  const approveRipple = async (ripple) => {
    const ids = selected[ripple._id] || [];
    try {
      await axios.put(
        `/api/ripples/${ripple._id}/approve`,
        ids.length ? { assignedClusters: ids } : {},
        { headers: authHeader }
      );
      setRipples((prev) => prev.filter((r) => r._id !== ripple._id));
    } catch (err) {
      console.error('Approve ripple error:', err);
    }
  };

  const dismissRipple = async (id) => {
    try {
      await axios.put(`/api/ripples/${id}/dismiss`, {}, { headers: authHeader });
      setRipples((prev) => prev.filter((r) => r._id !== id));
    } catch (err) {
      console.error('Dismiss ripple error:', err);
    }
  };

  const setRippleClusters = (id, values) =>
    setSelected((m) => ({ ...m, [id]: values }));

  if (loading) return <div className="ripple-box font-glow text-vein">Loading ripples…</div>;

  return (
    <div className="ripple-box">
      <h3 className="font-thread text-vein mb-2">Ripples</h3>

      {ripples.length === 0 ? (
        <p className="ripple-empty font-glow text-vein">No suggestions for this day.</p>
      ) : (
        <ul className="ripple-list space-y-3">
          {ripples.map((r) => {
            const chosen = selected[r._id] || [];
            return (
              <li
                key={r._id}
                className="ripple-item bg-lantern border border-veil shadow-sm rounded-lg p-3 text-ink"
              >
                <p className="ripple-text font-glow text-sm mb-2">{r.extractedText}</p>

                <div className="mb-2">
                  <ClusterChips
                    allClusters={clusters}
                    value={chosen}
                    onChange={(vals) => setRippleClusters(r._id, vals)}
                  />
                </div>

                <div className="ripple-actions flex gap-2">
                  <button
                    className="px-3 py-1 rounded-button bg-thread text-mist hover:bg-plum hover:text-veil font-thread text-sm transition-all"
                    onClick={() => approveRipple(r)}
                    title="Create Task"
                  >
                    + Add to Tasks
                    {chosen.length > 0 ? ` (${chosen.length})` : ''}
                  </button>
                  <button
                    className="px-3 py-1 rounded-button bg-muted text-ink hover:bg-veil hover:text-mist font-thread text-sm transition-all"
                    onClick={() => dismissRipple(r._id)}
                    title="Dismiss"
                  >
                    ✕ Dismiss
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default DailyRipples;
