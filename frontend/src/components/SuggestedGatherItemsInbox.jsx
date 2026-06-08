import React, { useCallback, useEffect, useState } from 'react';
import {
  acceptSuggestedGatherItem,
  listSuggestedGatherItems,
  rejectSuggestedGatherItem,
} from '../api/suggestedGatherItems.js';

function clusterLabel(cluster) {
  if (!cluster) return '';
  if (typeof cluster === 'string') return cluster;
  return cluster.name || cluster.label || cluster.slug || cluster._id || cluster.id || '';
}

function formatConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `${Math.round(number * 100)}%`;
}

export default function SuggestedGatherItemsInbox({ onAccepted, onRejected, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listSuggestedGatherItems();
      setItems(list);
    } catch (err) {
      console.error('[SuggestedGatherItemsInbox] load failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not load Gather suggestions.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setBusy(id, busy) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function accept(item) {
    const id = item?._id || item?.id;
    if (!id) return;
    setBusy(id, true);
    try {
      const result = await acceptSuggestedGatherItem(id);
      setItems((current) => current.filter((candidate) => (candidate._id || candidate.id) !== id));
      onAccepted?.(result?.gatherItem || result);
      onChanged?.();
    } catch (err) {
      console.error('[SuggestedGatherItemsInbox] accept failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not accept this Gather suggestion.');
    } finally {
      setBusy(id, false);
    }
  }

  async function reject(item) {
    const id = item?._id || item?.id;
    if (!id) return;
    setBusy(id, true);
    try {
      const result = await rejectSuggestedGatherItem(id);
      setItems((current) => current.filter((candidate) => (candidate._id || candidate.id) !== id));
      onRejected?.(result);
      onChanged?.();
    } catch (err) {
      console.error('[SuggestedGatherItemsInbox] reject failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not reject this Gather suggestion.');
    } finally {
      setBusy(id, false);
    }
  }

  return (
    <section className="card" aria-live="polite">
      <div className="stack">
        <div>
          <h2 className="section-title">Gather Suggestions</h2>
          <p className="page-subtitle">These were found inside your entries.</p>
        </div>

        {loading && <p className="muted">Loading Gather suggestions...</p>}
        {!loading && error && <div className="alert error">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <p className="muted">No Gather suggestions waiting.</p>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {items.map((item) => {
              const id = item._id || item.id;
              const clusters = Array.isArray(item.clusters) ? item.clusters.map(clusterLabel).filter(Boolean) : [];
              const confidence = formatConfidence(item.confidence);
              const busy = busyIds.has(id);

              return (
                <article
                  key={id}
                  className="card"
                  style={{ boxShadow: 'none', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <div className="stack" style={{ gap: 'var(--space-1)', minWidth: 0 }}>
                      <strong>{item.title || 'Untitled Gather item'}</strong>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        {item.list && <span className="pill">{item.list}</span>}
                        {clusters.map((cluster) => <span key={cluster} className="pill pill-muted">{cluster}</span>)}
                        {item.reason && <span className="pill pill-muted">{item.reason}</span>}
                        {confidence && <span className="pill pill-muted">{confidence}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'start' }}>
                      <button type="button" className="button" onClick={() => accept(item)} disabled={busy}>
                        Accept
                      </button>
                      <button type="button" className="button" onClick={() => reject(item)} disabled={busy}>
                        Reject
                      </button>
                    </div>
                  </div>

                  {item.sourceText && <p className="muted" style={{ margin: 0 }}>source: "{item.sourceText}"</p>}
                  {Array.isArray(item.tags) && item.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      {item.tags.map((tag) => <span key={tag} className="pill pill-muted">#{tag}</span>)}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
