// frontend/src/pages/Clusters.jsx
import { useEffect, useState } from 'react';

export default function Clusters() {
  const [clusters, setClusters] = useState([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#9ecae1');
  const [loading, setLoading] = useState(false);
  const authHeaders = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')||''}` });

  const load = async () => {
    const r = await fetch('/api/clusters', { headers: authHeaders() });
    const data = await r.json();
    setClusters(Array.isArray(data) ? data : []);
  };

  const create = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/clusters', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, color }) });
      setName(''); setColor('#9ecae1'); await load();
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="page" style={{ padding: 16 }}>
      <h2>Clusters</h2>
      <form onSubmit={create} style={{ display:'flex', gap:8, margin:'12px 0' }}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="New cluster name" required />
        <input type="color" value={color} onChange={e=>setColor(e.target.value)} />
        <button disabled={loading}>Add</button>
      </form>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:12 }}>
        {clusters.map(c => (
          <div key={c._id} style={{ borderRadius:12, padding:12, background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:14, height:14, borderRadius:999, background:c.color }} />
              <strong>{c.name}</strong>
            </div>
            <small style={{ opacity:.7 }}>updated {new Date(c.updatedAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
