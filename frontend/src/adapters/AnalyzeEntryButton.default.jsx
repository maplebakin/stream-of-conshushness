import React, { useState } from 'react';
import { analyzeEntry } from '../api/ripples.js';

export default function AnalyzeEntryButton({ entryId, text, date, onRipples }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run() {
    setBusy(true);
    setErr('');
    try {
      const data = await analyzeEntry({ entryId, text, date });
      const ripples = Array.isArray(data) ? data : (data?.ripples || []);
      onRipples?.(ripples);
    } catch (e) {
      console.error(e);
      setErr(e?.response?.data?.error || e?.message || 'analyze failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-primary" onClick={run} disabled={busy || !text}>
        {busy ? 'analyzing…' : 'analyze entry'}
      </button>
      {err ? <span className="text-sm text-red-600">{err}</span> : null}
    </div>
  );
}
