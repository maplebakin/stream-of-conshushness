import React, { useMemo, useState } from 'react';
import ADAPTERS from './index.js';
import { DEFAULT_PROPS } from './adapterMocks.js';
import ErrorBoundary from '../ErrorBoundary.jsx';

// Tiny JSON editor helper
function useJsonState(initialObj) {
  const [text, setText] = useState(() => JSON.stringify(initialObj, null, 2));
  const value = useMemo(() => {
    try { return JSON.parse(text); } catch { return null; }
  }, [text]);
  const valid = value !== null;
  return { text, setText, value, valid };
}

export default function AdapterHarness() {
  const names = Object.keys(ADAPTERS);
  const [name, setName] = useState(names[0] || '');
  const Comp = ADAPTERS[name];
  const { text, setText, value, valid } = useJsonState(DEFAULT_PROPS[name] ?? {});
  const [mounted, setMounted] = useState(true);

  // If user switches component, reset editor to that component's defaults
  React.useEffect(() => {
    setMounted(true);
  }, [name]);

  React.useEffect(() => {
    const defaults = DEFAULT_PROPS[name] ?? {};
    setText(JSON.stringify(defaults, null, 2));
  }, [name, setText]);

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Adapters Harness</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          <span style={{ marginRight: 8 }}>Component:</span>
          <select value={name} onChange={(e) => setName(e.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <button onClick={() => setMounted((m) => !m)}>
          {mounted ? 'Unmount' : 'Mount'}
        </button>

        {!valid && <span style={{ color: 'crimson' }}>Props JSON is invalid</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Props (editable JSON)</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            style={{ width: '100%', minHeight: 300, fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Render</div>
          <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, minHeight: 300 }}>
            {mounted && Comp ? (
              <ErrorBoundary>
                <Comp {...(valid ? value : {})} />
              </ErrorBoundary>
            ) : (
              <em>Not mounted.</em>
            )}
          </div>
        </div>
      </div>

      <div style={{ opacity: 0.7 }}>
        <div style={{ fontSize: 12 }}>Tip: tweak props JSON until the component is happy. Crashes will show above.</div>
      </div>
    </div>
  );
}
