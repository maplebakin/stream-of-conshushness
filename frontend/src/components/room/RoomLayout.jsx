// frontend/src/components/room/RoomLayout.jsx
import React, { useEffect, useMemo, useState } from 'react';
import '../../Main.css';

// tiny hook so we don't add dependencies
function useMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    onChange();
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
    };
  }, [query]);
  return matches;
}

export default function RoomLayout({ title, left, children, right }) {
  const isMobile = useMedia('(max-width: 900px)');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // close drawers when switching to desktop
  useEffect(() => {
    if (!isMobile) { setLeftOpen(false); setRightOpen(false); }
  }, [isMobile]);

  const gridStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '260px 1fr 320px',
    gap: '1rem',
    alignItems: 'start'
  }), [isMobile]);

  const mobileBar = (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', marginBottom: 8,
        background: 'var(--surface, #fff)', borderBottom: '1px solid var(--line, #eee)',
        borderRadius: 8
      }}
      className="card"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="button"
          onClick={() => setLeftOpen(true)}
          aria-label="Open spine"
          title="Open spine"
        >
          ☰
        </button>
        <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{title}</h2>
      </div>
      <button
        type="button"
        className="button"
        onClick={() => setRightOpen(true)}
        aria-label="Open insights"
        title="Open insights"
      >
        ✨
      </button>
    </div>
  );

  const Drawer = ({ side = 'left', open, onClose, children: node }) => {
    if (!open) return null;
    const fromLeft = side === 'left';
    return (
      <div
        role="dialog"
        aria-modal="true"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 30,
          background: 'rgba(0,0,0,0.3)'
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            [fromLeft ? 'left' : 'right']: 0,
            width: '86vw',
            maxWidth: 420,
            background: 'var(--surface, #fff)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            borderTopLeftRadius: fromLeft ? 0 : 12,
            borderBottomLeftRadius: fromLeft ? 0 : 12,
            borderTopRightRadius: fromLeft ? 12 : 0,
            borderBottomRightRadius: fromLeft ? 12 : 0,
            padding: 12,
            display: 'flex', flexDirection: 'column'
          }}
          className="card"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ textTransform: 'capitalize' }}>{fromLeft ? 'Spine' : 'Insights'}</strong>
            <button className="button" onClick={onClose} aria-label="Close drawer">×</button>
          </div>
          <div style={{ overflow: 'auto' }}>{node}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      {isMobile && mobileBar}

      <div style={gridStyle}>
        {!isMobile && (
          <aside className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
            {left}
          </aside>
        )}

        <main>{children}</main>

        {!isMobile && (
          <aside className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
            {right}
          </aside>
        )}
      </div>

      {/* Mobile drawers */}
      {isMobile && (
        <>
          <Drawer side="left" open={leftOpen} onClose={() => setLeftOpen(false)}>{left}</Drawer>
          <Drawer side="right" open={rightOpen} onClose={() => setRightOpen(false)}>{right}</Drawer>
        </>
      )}
    </div>
  );
}
