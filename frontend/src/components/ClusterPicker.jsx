// frontend/src/components/ClusterPicker.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../AuthContext.jsx';
import { makeApi } from '../utils/api.js';

function normalizeClusters(payload) {
  // Accept {data:[...]}, [...], or anything else → []
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export default function ClusterPicker({
  value = '',
  onChange,
  disabled = false,
  id = 'cluster-picker'
}) {
  const { token } = useContext(AuthContext);
  const api = useMemo(() => makeApi(token), [token]);

  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/clusters');
        if (ignore) return;
        const list = normalizeClusters(res).map(c => ({
          key: c.key ?? (c.slug || c.name?.toLowerCase() || ''),
          label: c.label ?? c.name ?? c.key ?? ''
        })).filter(c => c.key && c.label);
        // sort pinned/order/label if present
        const original = normalizeClusters(res);
        const keyed = new Map(list.map(c => [c.key, c]));
        const pinnedMap = new Map(original.map(c => [c.key, !!c.pinned]));
        const orderMap  = new Map(original.map(c => [c.key, typeof c.order === 'number' ? c.order : 0]));
        const sorted = [...keyed.values()].sort((a, b) => {
          const pA = pinnedMap.get(a.key) ? 1 : 0;
          const pB = pinnedMap.get(b.key) ? 1 : 0;
          if (pA !== pB) return pB - pA;
          const oA = orderMap.get(a.key) ?? 0;
          const oB = orderMap.get(b.key) ?? 0;
          if (oA !== oB) return oA - oB;
          return a.label.localeCompare(b.label);
        });
        setClusters(sorted);
      } catch (e) {
        console.error(e);
        setClusters([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [api]);

  const v = value || '';

  return (
    <div className="qa-row">
      <span className="qa-label">{v ? `Cluster: ${v}` : 'Unassigned'}</span>
      <select
        id={id}
        className="qa-select"
        disabled={disabled || loading}
        value={v}
        onChange={e => onChange && onChange(e.target.value)}
        aria-label="Set cluster"
      >
        <option value="">{loading ? 'Loading clusters…' : '— set cluster —'}</option>
        {clusters.map(c => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>
    </div>
  );
}
