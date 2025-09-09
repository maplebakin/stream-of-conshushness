// frontend/src/components/CarryForwardButton.jsx
import React, { useContext, useState } from 'react';
import { carryForwardDay } from '../api/tasksAdapter.js';
import { AuthContext } from '../AuthContext.jsx'; // adjust path if yours differs

export default function CarryForwardButton({
  viewISO,           // YYYY-MM-DD of the day you're looking at
  cluster = null,    // optional cluster filter
  onMoved = () => {},// callback({ moved, from, to })
  label = 'Carry to Tomorrow'
}) {
  const { token } = useContext(AuthContext) || { token: null };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleClick() {
    try {
      setBusy(true); setErr('');
      const result = await carryForwardDay({
        token,
        viewISO,
        cluster,
        smart: true,           // auto-fallback to latest earlier bucket
        includeNoDate: false   // flip to true if you want undated dragged along
      });
      onMoved(result);
    } catch (e) {
      setErr(e.message || 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={busy}
        className="px-3 py-1 rounded-xl border border-gray-600 hover:bg-gray-800 disabled:opacity-50"
        title="Move all incomplete tasks from this day to tomorrow"
      >
        {busy ? 'Moving…' : label}
      </button>
      {err ? <span className="text-red-400 text-sm">{err}</span> : null}
    </div>
  );
}
