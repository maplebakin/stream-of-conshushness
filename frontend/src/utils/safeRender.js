// frontend/src/utils/safeRender.js
import React from 'react';

function isReactComponent(v) {
  if (typeof v === 'function') return true; // function component
  // accept memo/lazy/forwardRef objects that carry $$typeof
  return !!(v && typeof v === 'object' && '$$typeof' in v);
}

/**
 * Only render if it looks like a real React component.
 * Otherwise log and return null so the page doesn’t explode.
 */
export function renderSafe(Comp, props = {}, name = 'Anonymous') {
  if (!isReactComponent(Comp)) {
    // eslint-disable-next-line no-console
    console.error(`[renderSafe] Invalid component for <${name}/>`, { received: Comp, type: typeof Comp });
    return null;
  }
  return React.createElement(Comp, props);
}
