// frontend/src/EntriesSection.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { toDisplay } from './utils/display.js';

/* tiny helpers to keep this in lockstep with DailyPage */
function isoFromDateLike(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function entryDateISO(en) {
  return en?.date || en?.dateISO || isoFromDateLike(en?.createdAt) || '';
}
function stripHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}
function entryHasMeaningfulText(en) {
  const t = typeof en?.text === 'string' ? en.text : '';
  const c = typeof en?.content === 'string' ? en.content : '';
  const plain = (t || stripHtml(c)).replace(/\s+/g, ' ').trim();
  return plain.length > 0;
}

/**
 * EntriesSection
 * Props:
 * - date (YYYY-MM-DD)
 * - unassignedOnly?: boolean (default false)
 */
export default function EntriesSection({ date, unassignedOnly = false }) {
  const { token } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    let ignore = false;
    if (!date || !token) return;

    (async () => {
      setLoading(true);
      setErr('');
      try {
        const res = await axios.get(`/api/entries/by-date/${date}`, { headers });
        let list = Array.isArray(res.data) ? res.data : [];
        list = list.filter(e => entryDateISO(e) === date);
        list = list.filter(entryHasMeaningfulText);
        if (unassignedOnly) list = list.filter(e => !e?.cluster || e.cluster === '');
        if (!ignore) setEntries(list);
      } catch (e) {
        console.warn('EntriesSection load failed:', e?.response?.data || e.message);
        if (!ignore) {
          setErr('Failed to load entries.');
          setEntries([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => { ignore = true; };
  }, [date, token, unassignedOnly]);

  const safeEntries = useMemo(() => Array.isArray(entries) ? entries : [], [entries]);

  return (
    <section className="panel">
      <div className="entries-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h3 className="font-thread text-vein" style={{ margin: 0 }}>Entries</h3>
        <span className="muted">{date}</span>
      </div>

      {loading && <p className="muted">Loading entries…</p>}
      {!loading && err && <p className="error">{err}</p>}
      {!loading && !err && safeEntries.length === 0 && (
        <p className="muted">{unassignedOnly ? 'No unassigned entries.' : 'No entries yet.'}</p>
      )}

      {safeEntries.map((entry) => {
        const body = toDisplay(entry.text ?? entry.content ?? '');
        return (
          <article key={entry._id} className="entry-card">
            <div className="entry-meta">
              <span className="date">{entry.date}</span>
              {entry.mood && <span className="pill">{entry.mood}</span>}
              {Array.isArray(entry.tags) &&
                entry.tags.slice(0,5).map((t,i) => (
                  <span key={i} className="pill pill-muted">#{t}</span>
                ))}
              {entry.section && <span className="pill pill-muted">{entry.section}</span>}
              {entry.cluster && <span className="pill">{entry.cluster}</span>}
            </div>
            <div className="entry-text">
              {body || <span className="muted">(no text)</span>}
            </div>
          </article>
        );
      })}
    </section>
  );
}
