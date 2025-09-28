import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../AuthContext.jsx';
import { makeApi } from '../utils/api.js';
import { normalizeClusterList } from '../utils/clusterHelpers.js';

export default function ClusterPicker({ value = '', onChange, disabled = false, id = 'cluster-picker' }) {
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
        const list = normalizeClusterList(res)
          .map((c) => ({ key: c.slug, label: c.name }))
          .filter((c) => c.key && c.label);
        list.sort((a, b) => a.label.localeCompare(b.label));
        setClusters(list);
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
  const activeLabel = clusters.find(c => c.key === v)?.label;

  return (
    <div className="qa-row">
      <span className="qa-label">{v ? `Cluster: ${activeLabel || v}` : 'Unassigned'}</span>
      <select
        id={id}
        className="qa-select"
        disabled={disabled || loading}
        value={v}
        onChange={e => onChange && onChange(e.target.value)}
        aria-label="Set cluster"
      >
        <option value="">{loading ? 'Loading clusters…' : '— set cluster —'}</option>
        {clusters.map(c => (<option key={c.key} value={c.key}>{c.label}</option>))}
      </select>
    </div>
  );
}
