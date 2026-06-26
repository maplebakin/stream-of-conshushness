import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listInterests, updateInterestStatus } from '../api/interests.js';
import SuggestedInterestsInbox from '../components/SuggestedInterestsInbox.jsx';

const STATUSES = ['curious', 'exploring', 'active', 'paused', 'archived'];
const UNCATEGORIZED = 'Learning Curiosities';

function groupByCategory(items = []) {
  const grouped = new Map();
  for (const item of items) {
    const category = item?.category || UNCATEGORIZED;
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }
  return Array.from(grouped.entries()).map(([category, categoryItems]) => ({
    category,
    items: categoryItems,
  }));
}

export default function InterestsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listInterests();
      setItems(list);
    } catch (err) {
      console.error('[InterestsPage] load failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not load Sparks & Interests.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => groupByCategory(items), [items]);

  function setBusy(id, busy) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function updateStatus(item, status) {
    const id = item?._id || item?.id;
    if (!id || item.status === status) return;
    setBusy(id, true);
    try {
      const updated = await updateInterestStatus(id, status);
      setItems((current) => current.map((candidate) => ((candidate._id || candidate.id) === id ? updated : candidate)));
    } catch (err) {
      console.error('[InterestsPage] status update failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not update Interest.');
    } finally {
      setBusy(id, false);
    }
  }

  return (
    <div className="page review-page">
      <header className="page-header review-page__header">
        <div>
          <h1 className="page-title review-page__title">Interests</h1>
          <p className="page-subtitle review-page__subtitle">Review curiosities, skills, hobbies, research threads, and things you may want to explore.</p>
        </div>
        <div className="review-page__summary">
          <span>{items.length} active</span>
          <button type="button" className="review-button review-button--ghost" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </header>

      <SuggestedInterestsInbox onAccepted={load} onRejected={load} />

      <section className="card review-card" aria-live="polite">
        <div className="stack">
          <h2 className="section-title">Interest List ({items.length})</h2>
          {loading && <p className="muted">Loading Sparks & Interests...</p>}
          {!loading && error && <div className="alert error">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <p className="review-empty">Accepted interests will appear here after you accept a suggestion.</p>
          )}

          {!loading && !error && grouped.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {grouped.map((categoryGroup) => (
                <section key={categoryGroup.category} className="stack" style={{ gap: 'var(--space-2)' }}>
                  <h3 style={{ margin: 0 }}>{categoryGroup.category}</h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
                    {categoryGroup.items.map((item) => {
                      const id = item._id || item.id;
                      return (
                        <li
                          key={id}
                          className="card review-card"
                          style={{ boxShadow: 'none', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0 }}>
                              <strong className="review-card__title">{item.title || 'Untitled Interest'}</strong>
                              {item.sourceText && <p className="review-card__source" style={{ margin: '0.25rem 0 0' }}>source: "{item.sourceText}"</p>}
                              {!item.sourceText && item.sourceEntryId && (
                                <p className="review-card__source" style={{ margin: '0.25rem 0 0' }}>source entry: {item.sourceEntryId}</p>
                              )}
                            </div>
                            <label className="pill pill-muted">
                              <span>Status</span>
                              <select
                                value={item.status || 'curious'}
                                onChange={(event) => updateStatus(item, event.target.value)}
                                disabled={busyIds.has(id)}
                                style={{ border: 0, background: 'transparent', font: 'inherit' }}
                              >
                                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                              </select>
                            </label>
                          </div>
                          {Array.isArray(item.tags) && item.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                              {item.tags.map((tag) => <span key={tag} className="review-pill">#{tag}</span>)}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
