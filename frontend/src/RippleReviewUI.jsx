// frontend/src/RippleReviewUI.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { toDisplay, formatRecurrence } from './utils/display.js';
import TaskModal from './TaskModal.jsx';
import { normalizeClusterList } from './utils/clusterHelpers.js';
import { todayISOInToronto } from './utils/date.js';
import { standaloneRippleReviewPath } from './utils/rippleReview.js';
import { useToast } from './hooks/useToast.js';
import './RippleReviewUI.css';

const band = (c) => (Number(c) >= 0.66 ? 'high' : Number(c) >= 0.33 ? 'medium' : 'low');

const colorClass = {
  high: 'bg-green-50 border-green-200',
  medium: 'bg-yellow-50 border-yellow-200',
  low: 'bg-gray-50 border-gray-200'
};

/* ───────────────── client-side sieve ───────────────── */
const ACTION_VERBS = [
  'buy','call','email','text','message',
  'schedule','book','attend',
  'clean','wash','wipe','vacuum','mop','water','feed',
  'pay','renew','submit','file','send','print','scan',
  'write','read','finish','fix','update','check','review',
  'install','uninstall','replace',
  'pick up','drop off','prepare','plan','organize','record','practice','backup','back up'
];
const FILLER = [
  /\bidk\b/i, /\bsomething\b/i, /\blet['’]s see\b/i, /\bthat'?s at least\b/i,
  /\bwell(,|\s)/i, /\byeah\b/i, /\bdramatique\b/i, /\bsemi-?functional\b/i,
  /^\s*(hmm+|uh+|erm)\b/i
];
const BORING_SINGLE_WORDS = new Set(['day','today','tomorrow','sometime','later','soon','now','please']);
const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hasActionVerb(text) {
  const s = String(text || '').toLowerCase();
  for (const v of ACTION_VERBS.filter(v => v.includes(' '))) {
    if (new RegExp(`\\b${escapeRx(v)}\\b`, 'i').test(s)) return true;
  }
  for (const v of ACTION_VERBS.filter(v => !v.includes(' '))) {
    if (new RegExp(`\\b${escapeRx(v)}(e|ed|es|ing)?\\b`, 'i').test(s)) return true;
  }
  return false;
}
function looksLikeJunk(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  if (!/\s/.test(s) && BORING_SINGLE_WORDS.has(s.toLowerCase())) return true;
  if (s.length < 6) return true;
  if (FILLER.some(p => p.test(s))) return true;
  const letters = (s.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  const punct   = (s.match(/[.,!?…]/g) || []).length;
  if (letters < 8 || punct > letters / 2) return true;
  return false;
}
function isActiony(text) { return !looksLikeJunk(text) && hasActionVerb(text); }
function getConfidence(r) {
  if (r.confidence != null) return Number(r.confidence);
  if (r.score != null) return Number(r.score) / 100;
  return 1;
}

async function dismissRipple(id, headers) {
  try {
    await axios.post(`/api/ripples/${id}/dismiss`, {}, { headers });
    return true;
  } catch (error) {
    console.warn('[RippleReviewUI] dismiss failed', error);
  }
  throw new Error('dismiss failed');
}

/**
 * RippleReviewUI
 * Props:
 *   - date?: ISO string; defaults to today (America/Toronto)
 *   - header?: string
 */
export default function RippleReviewUI({ date, header = '🌊 Ripple Review' }) {
  const { token } = useContext(AuthContext);
  const { showToast } = useToast();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );
  const dayISO = useMemo(() => date || todayISOInToronto(), [date]);

  const [ripples, setRipples] = useState([]);
  const [filter, setFilter] = useState('pending');

  // strictness dials (persisted)
  const [hideChatter, setHideChatter] = useState(
    () => localStorage.getItem('rr_hide_chatter') !== '0'
  );
  const [minConf, setMinConf] = useState(() => {
    const v = Number(localStorage.getItem('rr_min_conf'));
    return Number.isFinite(v) ? v : 0.66;
  });

  const [clusters, setClusters] = useState([]);
  const [clusterSel, setClusterSel] = useState({});
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // TaskModal control
  const [taskDraft, setTaskDraft] = useState(null); // { title, dueDate, cluster, rippleId }

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await axios.get('/api/clusters', { headers: authHeaders });
        if (ignore) return;
        const list = normalizeClusterList(res);
        setClusters(list.map((c) => ({ id: c.slug, name: c.name })));
      } catch {
        if (!ignore) {
          setClusters([
            { id: 'home', name: 'Home' },
            { id: 'work', name: 'Work' },
            { id: 'personal', name: 'Personal' },
            { id: 'health', name: 'Health' }
          ]);
        }
      }
    })();
    return () => { ignore = true; };
  }, [authHeaders]);

  useEffect(() => {
    if (!token) return;
    let ignore = false;
    setLoading(true);
    setErr('');
    (async () => {
      try {
        const res = await axios.get(standaloneRippleReviewPath(dayISO), { headers: authHeaders });
        if (ignore) return;
        const arr = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.ripples) ? res.data.ripples : []);
        setRipples(arr);
        const init = {};
        for (const r of arr) {
          const id = r._id || r.id;
          const hinted = r.meta?.dueDate || r.dueDate || dayISO;
          init[id] = { dueDate: hinted };
        }
        setDrafts(init);
      } catch (e) {
        if (!ignore) {
          console.error('Failed to fetch ripples:', e);
          setErr('Failed to load ripples');
          setRipples([]);
          setDrafts({});
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [token, authHeaders, dayISO]);

  useEffect(() => { localStorage.setItem('rr_hide_chatter', hideChatter ? '1' : '0'); }, [hideChatter]);
  useEffect(() => { localStorage.setItem('rr_min_conf', String(minConf)); }, [minConf]);

  async function onTaskSavedClose() {
    if (!taskDraft) return setTaskDraft(null);
    try {
      await dismissRipple(taskDraft.rippleId, authHeaders);
      setRipples(prev => prev.filter(r => (r._id || r.id) !== taskDraft.rippleId));
    } catch (e) {
      console.error('Could not auto-dismiss ripple after task save:', e);
    }
    setTaskDraft(null);
  }

  async function actDismiss(id) {
    try {
      await dismissRipple(id, authHeaders);
      setRipples(prev => prev.filter(r => (r._id || r.id) !== id));
    } catch (e) {
      console.error('dismiss error:', e);
      showToast('Could not dismiss ripple.', { type: 'error' });
    }
  }

  const visible = useMemo(() => {
    let arr = ripples;

    // status/confidence band filter
    arr = arr.filter(r => {
      const status = r.status || 'pending';
      if (filter === 'all') return true;
      if (['pending','approved','dismissed'].includes(filter)) return status === filter;
      if (['high','medium','low'].includes(filter)) return band(getConfidence(r)) === filter;
      return true;
    });

    // our sieve: verb-required + confidence gate
    arr = arr.filter(r => {
      const txt = r.extractedText || r.text || '';
      const conf = getConfidence(r);
      if (hideChatter && !isActiony(txt)) return false;
      return !isNaN(minConf) ? conf >= minConf : true;
    });

    return arr;
  }, [ripples, filter, hideChatter, minConf]);

  return (
    <div className="review-page ripple-review">
      <header className="review-page__header">
        <div>
          <h1 className="review-page__title">{header}</h1>
          <p className="review-page__subtitle">Review pending ripples and turn useful captured threads into tasks.</p>
        </div>
        <div className="review-page__summary">
          <span>{visible.length} shown</span>
          <span>{ripples.length} total</span>
          <span>{dayISO}</span>
        </div>
      </header>

      <div className="review-page__summary filter-group">
        {['all','pending','approved','dismissed','high','medium','low'].map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`review-button ${filter === t ? 'review-button--secondary' : 'review-button--ghost'}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}

        <button
          onClick={() => setHideChatter(v => !v)}
          className={`review-button ${hideChatter ? 'review-button--secondary' : 'review-button--ghost'}`}
          title="Require a real action verb and suppress filler"
        >
          Hide chatter: {hideChatter ? 'On' : 'Off'}
        </button>

        <label className="review-pill">
          Min conf:
          <select
            className="bg-transparent"
            value={minConf}
            onChange={e => setMinConf(Number(e.target.value))}
            title="Minimum confidence to display"
          >
            <option value={0}>0%</option>
            <option value={0.5}>50%</option>
            <option value={0.66}>66%</option>
            <option value={0.75}>75%</option>
            <option value={0.85}>85%</option>
          </select>
        </label>
      </div>

      {loading && <div className="review-empty">Loading ripples...</div>}
      {!loading && err && <div className="alert error">{err}</div>}
      {!loading && !err && visible.length === 0 && (
        <div className="review-empty">No ripples match this review view. Pending ripples from new entries will appear here.</div>
      )}

      {visible.map(r => {
        const id = r._id || r.id;
        const conf = getConfidence(r);
        const b = band(conf);
        const cluster = clusterSel[id] || '';
        const dueDate = drafts?.[id]?.dueDate || dayISO;

        return (
          <div key={id} className={`review-card ripple-card ${colorClass[b]}`}>
            <div className="review-card__title">{toDisplay(r.extractedText || r.text || '')}</div>

            {r.originalContext && typeof r.originalContext === 'string' && (
              <div className="review-card__source">"{r.originalContext}"</div>
            )}

            {r.recurrence && (
              <div className="review-card__meta">
                <span className="review-pill">
                  repeat: {formatRecurrence(r.recurrence)}
                </span>
              </div>
            )}

            {(r.status || 'pending') === 'pending' ? (
              <div className="review-card__actions">
                <select
                  value={cluster}
                  onChange={e => setClusterSel(prev => ({ ...prev, [id]: e.target.value }))}
                  className="review-pill"
                >
                  <option value="">Select Cluster</option>
                  {clusters.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>

                <input
                  type="date"
                  className="review-pill"
                  value={dueDate}
                  onChange={e => setDrafts(d => ({ ...d, [id]: { ...(d[id]||{}), dueDate: e.target.value } }))}
                  title="Due date hint"
                />

                <span className="review-pill">conf {Math.round(conf*100)}%</span>

                <button
                  onClick={() => setTaskDraft({
                    title: r.extractedText || r.text || '',
                    dueDate,
                    cluster,
                    rippleId: id
                  })}
                  disabled={false}
                  className="review-button review-button--primary"
                >
                  Make Task
                </button>
                <button
                  onClick={() => actDismiss(id)}
                  className="review-button review-button--danger"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <div className="review-card__meta">
                Status: <span className="font-semibold">{(r.status||'pending')}</span>
              </div>
            )}
          </div>
        );
      })}

      {taskDraft && (
        <TaskModal
          isOpen
          onClose={() => setTaskDraft(null)}
          onSaved={onTaskSavedClose}
          defaultTitle={taskDraft.title}
          defaultDueDate={taskDraft.dueDate}
          defaultCluster={taskDraft.cluster || ''}
        />
      )}
    </div>
  );
}
