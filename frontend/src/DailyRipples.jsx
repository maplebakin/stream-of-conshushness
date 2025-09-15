// src/DailyRipples.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import TaskModal from './TaskModal.jsx';
import './DailyRipples.css';

function todayISOInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const dd = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${dd}`;
}
function pickDateProp(props) {
  return props?.date || props?.dateISO || props?.day || todayISOInToronto();
}
function normalizeRipples(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.ripples)) return payload.ripples;
  if (payload && payload.data && Array.isArray(payload.data.ripples)) return payload.data.ripples;
  return [];
}

/* ───────────────── client-side sieve (strict but local) ───────────────── */
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
  return 1; // assume fine if unknown
}
function clientFilterRipples(list, { hideChatter, minConf }) {
  return list.filter(r => {
    const txt = r.extractedText || r.text || '';
    const conf = getConfidence(r);
    if (hideChatter && !isActiony(txt)) return false;
    if (!isNaN(minConf) && conf < minConf) return false;
    return true;
  });
}

/* ───────────────── robust backend actions ───────────────── */
async function dismissRipple(id, headers) {
  // Try common shapes until one works.
  // 1) POST /dismiss
  try {
    await axios.post(`/api/ripples/${id}/dismiss`, {}, { headers });
    return true;
  } catch {}
  // 2) PATCH status
  try {
    await axios.patch(`/api/ripples/${id}`, { status: 'dismissed' }, { headers });
    return true;
  } catch {}
  // 3) POST /status
  try {
    await axios.post(`/api/ripples/${id}/status`, { status: 'dismissed' }, { headers });
    return true;
  } catch {}
  throw new Error('dismiss failed');
}

/* ───────────────── component ───────────────── */
export default function DailyRipples(props) {
  const { token } = useContext(AuthContext);
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const day = pickDateProp(props);

  const [rawRipples, setRawRipples] = useState([]);
  const [ripples, setRipples] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [clusterSel, setClusterSel] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Strictness controls (persisted)
  const [hideChatter, setHideChatter] = useState(
    () => localStorage.getItem('ripples_hide_chatter') !== '0'
  );
  const [minConf, setMinConf] = useState(() => {
    const v = Number(localStorage.getItem('ripples_min_conf'));
    return Number.isFinite(v) ? v : 0.66; // default: 66%
  });

  // TaskModal control
  const [taskDraft, setTaskDraft] = useState(null); // { title, dueDate, cluster, rippleId }

  useEffect(() => {
    if (!token) return;
    axios.get('/api/clusters', { headers: authHeaders })
      .then(res => setClusters(Array.isArray(res.data) ? res.data : []))
      .catch(() => setClusters([]));
  }, [token, authHeaders]);

  useEffect(() => {
    if (!token) return;
    let ignore = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Support both /api/ripples?date= and /api/ripples/:date
        let res = await axios.get(`/api/ripples?date=${day}`, { headers: authHeaders })
          .catch(() => axios.get(`/api/ripples/${day}`, { headers: authHeaders }));
        const list = normalizeRipples(res);
        if (!ignore) {
          setRawRipples(list);
          setRipples(clientFilterRipples(list, { hideChatter, minConf }));
        }
      } catch (e) {
        if (!ignore) {
          console.error('[DailyRipples] load failed', e);
          setError('Failed to load ripples.');
          setRawRipples([]);
          setRipples([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [token, authHeaders, day]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-filter when dials change
  useEffect(() => {
    setRipples(clientFilterRipples(rawRipples, { hideChatter, minConf }));
  }, [hideChatter, minConf, rawRipples]);

  // persist dials
  useEffect(() => { localStorage.setItem('ripples_hide_chatter', hideChatter ? '1' : '0'); }, [hideChatter]);
  useEffect(() => { localStorage.setItem('ripples_min_conf', String(minConf)); }, [minConf]);

  function startMakeTask(r) {
    const id = r._id || r.id;
    const title = r.extractedText || r.text || '';
    const cluster = clusterSel[id] || '';
    const hintedDue = r.meta?.dueDate || r.dueDate || day;
    setTaskDraft({ title, dueDate: hintedDue, cluster, rippleId: id });
  }

  async function onTaskSavedClose() {
    // Called after TaskModal saves successfully
    if (!taskDraft) return setTaskDraft(null);
    try {
      await dismissRipple(taskDraft.rippleId, authHeaders);
      setRawRipples(prev => prev.filter(r => (r._id || r.id) !== taskDraft.rippleId));
      setRipples(prev => prev.filter(r => (r._id || r.id) !== taskDraft.rippleId));
    } catch (e) {
      console.error('Could not auto-dismiss ripple after task save:', e);
      // fall through: still close modal
    }
    setTaskDraft(null);
  }

  async function dismiss(id) {
    try {
      await dismissRipple(id, authHeaders);
      setRawRipples(prev => prev.filter(r => (r._id || r.id) !== id));
      setRipples(prev => prev.filter(r => (r._id || r.id) !== id));
    } catch (e) {
      console.error('dismiss ripple error', e);
      alert('Could not dismiss ripple.');
    }
  }

  return (
    <div className="ripple-box">
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
        <h3>Ripples for {day}</h3>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button
            className="chip"
            onClick={() => setHideChatter(v => !v)}
            title="Require a real action verb and suppress filler"
          >
            Hide chatter: {hideChatter ? 'On' : 'Off'}
          </button>
          <label className="chip" style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
            Min conf:
            <select
              className="chip-input"
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
      </div>

      {loading && <div className="ripple-empty">Loading…</div>}
      {!loading && error && <div className="ripple-empty">{error}</div>}
      {!loading && !error && ripples.length === 0 && (
        <div className="ripple-empty">No ripples today. Serene surface.</div>
      )}

      {!loading && !error && ripples.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
          {ripples.map(r => {
            const id = r._id || r.id;
            const conf = getConfidence(r);
            return (
              <li key={id} className="ripple-item">
                <div className="ripple-text">
                  {r.extractedText || r.text || '(no text)'}
                </div>

                <div className="ripple-actions">
                  {r.rrule ? <span className="chip">repeat</span> : null}
                  {Number.isFinite(conf) ? <span className="chip">conf {Math.round(conf * 100)}%</span> : null}

                  <select
                    className="chip-input"
                    value={clusterSel[id] || ''}
                    onChange={e => setClusterSel(prev => ({ ...prev, [id]: e.target.value }))}
                  >
                    <option value="">Cluster (optional)</option>
                    {clusters.map(c => (
                      <option key={c._id || c.id || c.key || c.name} value={c.name || c.label || c.key}>
                        {c.name || c.label || c.key}
                      </option>
                    ))}
                  </select>

                  <button className="chip chip--active" onClick={() => startMakeTask(r)}>Make Task</button>
                  <button className="chip" onClick={() => dismiss(id)}>Dismiss</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {taskDraft && (
        <TaskModal
          isOpen
          onClose={() => setTaskDraft(null)}
          onSaved={onTaskSavedClose}
          // gentle prefill; TaskModal will handle actual POST /api/tasks
          defaultTitle={taskDraft.title}
          defaultDueDate={taskDraft.dueDate}
          defaultCluster={taskDraft.cluster || ''}
        />
      )}
    </div>
  );
}
