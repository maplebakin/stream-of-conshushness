import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listGatherItems, updateGatherItemStatus } from '../api/gatherItems.js';
import SuggestedGatherItemsInbox from '../components/SuggestedGatherItemsInbox.jsx';

const STATUSES = ['needed', 'found', 'bought', 'dismissed'];
const UNCLUSTERED = 'No cluster';

function clusterLabel(cluster) {
  if (!cluster) return '';
  if (typeof cluster === 'string') return cluster;
  return cluster.name || cluster.label || cluster.slug || cluster._id || cluster.id || '';
}

function itemClusters(item) {
  const clusters = Array.isArray(item?.clusters) ? item.clusters.map(clusterLabel).filter(Boolean) : [];
  if (clusters.length) return clusters;
  if (item?.cluster) return [String(item.cluster)];
  return [UNCLUSTERED];
}

function groupItems(items = []) {
  const grouped = new Map();
  for (const item of items) {
    for (const cluster of itemClusters(item)) {
      if (!grouped.has(cluster)) grouped.set(cluster, new Map());
      const lists = grouped.get(cluster);
      const listName = item?.list || 'Things to Buy';
      if (!lists.has(listName)) lists.set(listName, []);
      lists.get(listName).push(item);
    }
  }
  return Array.from(grouped.entries()).map(([cluster, lists]) => ({
    cluster,
    lists: Array.from(lists.entries()).map(([list, listItems]) => ({ list, items: listItems })),
  }));
}

function itemId(item) {
  return item?._id || item?.id || '';
}

export default function GatherListsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listGatherItems();
      setItems(list);
    } catch (err) {
      console.error('[GatherListsPage] load failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not load Gather Lists.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => groupItems(items), [items]);

  function setBusy(id, busy) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function updateStatus(item, status) {
    const id = itemId(item);
    if (!id || item.status === status) return;
    setBusy(id, true);
    try {
      const updated = await updateGatherItemStatus(id, status);
      setItems((current) => current.map((candidate) => (itemId(candidate) === id ? updated : candidate)));
    } catch (err) {
      console.error('[GatherListsPage] status update failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not update Gather item.');
    } finally {
      setBusy(id, false);
    }
  }

  const handleAcceptedSuggestion = useCallback((acceptedItem) => {
    if (acceptedItem && itemId(acceptedItem)) {
      setItems((current) => {
        const acceptedId = itemId(acceptedItem);
        const withoutAccepted = current.filter((item) => itemId(item) !== acceptedId);
        return [acceptedItem, ...withoutAccepted];
      });
    }
    load();
  }, [load]);

  return (
    <div className="page review-page">
      <header className="page-header review-page__header">
        <div>
          <h1 className="page-title review-page__title">Gather</h1>
          <p className="page-subtitle review-page__subtitle">Review needed objects, supplies, replacements, containers, and future purchase ideas.</p>
        </div>
        <div className="review-page__summary">
          <span>{items.length} accepted</span>
          <button type="button" className="review-button review-button--ghost" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="card review-card" aria-live="polite">
        <div className="stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Gather Items ({items.length})</h2>
              <p className="page-subtitle">Accepted gather items live here.</p>
            </div>
          </div>
          {loading && <p className="muted">Loading Gather Lists...</p>}
          {!loading && error && <div className="alert error">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <p className="review-empty">Accepted gather items will appear here after you accept a suggestion.</p>
          )}

          {!loading && !error && grouped.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {grouped.map((clusterGroup) => (
                <section key={clusterGroup.cluster} className="stack" style={{ gap: 'var(--space-3)' }}>
                  <h3 style={{ margin: 0 }}>{clusterGroup.cluster}</h3>
                  {clusterGroup.lists.map((listGroup) => (
                    <div key={`${clusterGroup.cluster}:${listGroup.list}`} className="stack" style={{ gap: 'var(--space-2)' }}>
                      <h4 style={{ margin: 0 }}>{listGroup.list}</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
                        {listGroup.items.map((item) => {
                          const id = itemId(item);
                          return (
                            <li
                              key={id}
                              className="card review-card"
                              style={{ boxShadow: 'none', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                <div style={{ minWidth: 0 }}>
                                  <strong className="review-card__title">{item.title || 'Untitled Gather item'}</strong>
                                  <div className="review-card__meta" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                                    {item.list && <span className="review-pill">{item.list}</span>}
                                    {item.status && <span className="review-pill">{item.status}</span>}
                                  </div>
                                  {item.sourceText && <p className="review-card__source" style={{ margin: '0.25rem 0 0' }}>source: "{item.sourceText}"</p>}
                                  {!item.sourceText && item.sourceEntryId && (
                                    <p className="review-card__source" style={{ margin: '0.25rem 0 0' }}>source entry: {item.sourceEntryId}</p>
                                  )}
                                </div>
                                <label className="pill pill-muted">
                                  <span>Status</span>
                                  <select
                                    value={item.status || 'needed'}
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
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </section>

      <SuggestedGatherItemsInbox onAccepted={handleAcceptedSuggestion} onRejected={load} />
    </div>
  );
}
