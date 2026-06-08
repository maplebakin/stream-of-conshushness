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
    const id = item?._id || item?.id;
    if (!id || item.status === status) return;
    setBusy(id, true);
    try {
      const updated = await updateGatherItemStatus(id, status);
      setItems((current) => current.map((candidate) => ((candidate._id || candidate.id) === id ? updated : candidate)));
    } catch (err) {
      console.error('[GatherListsPage] status update failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not update Gather item.');
    } finally {
      setBusy(id, false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Gather Lists</h1>
          <p className="page-subtitle">Needed objects, supplies, replacements, containers, and future purchase ideas.</p>
        </div>
        <button type="button" className="pill pill-muted" onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </header>

      <SuggestedGatherItemsInbox onAccepted={load} onRejected={load} />

      <section className="card" aria-live="polite">
        <div className="stack">
          <h2 className="section-title">Gather Items</h2>
          {loading && <p className="muted">Loading Gather Lists...</p>}
          {!loading && error && <div className="alert error">{error}</div>}
          {!loading && !error && items.length === 0 && <p className="muted">No Gather Items yet.</p>}

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
                          const id = item._id || item.id;
                          return (
                            <li
                              key={id}
                              className="card"
                              style={{ boxShadow: 'none', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                <div style={{ minWidth: 0 }}>
                                  <strong>{item.title || 'Untitled Gather item'}</strong>
                                  {item.sourceText && <p className="muted" style={{ margin: '0.25rem 0 0' }}>source: "{item.sourceText}"</p>}
                                  {!item.sourceText && item.sourceEntryId && (
                                    <p className="muted" style={{ margin: '0.25rem 0 0' }}>source entry: {item.sourceEntryId}</p>
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
                                  {item.tags.map((tag) => <span key={tag} className="pill pill-muted">#{tag}</span>)}
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
    </div>
  );
}
