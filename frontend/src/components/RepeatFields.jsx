// frontend/src/components/RepeatFields.jsx
import React from 'react';

const DOW = [
  { key: 'SU', label: 'Su' },
  { key: 'MO', label: 'Mo' },
  { key: 'TU', label: 'Tu' },
  { key: 'WE', label: 'We' },
  { key: 'TH', label: 'Th' },
  { key: 'FR', label: 'Fr' },
  { key: 'SA', label: 'Sa' },
];

export default function RepeatFields({
  enabled, setEnabled,
  freq, setFreq,
  interval, setInterval,
  byday, setByday,
  startDate, setStartDate,
  until, setUntil,
}) {
  const toggleDay = (code) => {
    if (!byday.includes(code)) setByday([...byday, code]);
    else setByday(byday.filter(d => d !== code));
  };

  return (
    <div className="repeat-block" style={{ marginTop: 12, borderTop: '1px solid var(--color-border,#e4e4e7)', paddingTop: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <span>Repeat</span>
      </label>

      {enabled && (
        <div className="repeat-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginTop: 8 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Frequency</div>
            <select value={freq} onChange={e => setFreq(e.target.value)} style={{ width: '100%' }}>
              <option value="WEEKLY">Weekly</option>
              <option value="DAILY">Daily</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>

          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Interval</div>
            <input type="number" min="1" value={interval} onChange={e => setInterval(e.target.value)} style={{ width: '100%' }} />
          </label>

          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Start Date</div>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%' }} />
          </label>

          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Until (optional)</div>
            <input type="date" value={until} onChange={e => setUntil(e.target.value)} style={{ width: '100%' }} />
          </label>

          {freq === 'WEEKLY' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Days</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DOW.map(d => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border,#e4e4e7)',
                      background: byday.includes(d.key) ? 'var(--color-accent,#e9d5ff)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
