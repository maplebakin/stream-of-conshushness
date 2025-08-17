// utils/safeRender.js
import React from 'react';

function isReactComponent(v) {
  // valid if function (function component, memo-wrapped function returns object but callable)
  if (typeof v === 'function') return true;
  // or if it's a React element-like object (lazy/memo/forwardRef objects with $$typeof)
  return !!(v && typeof v === 'object' && '$$typeof' in v);
}

/**
 * renderSafe(Comp, props, name)
 * Only renders if Comp looks like a React component. Otherwise logs and returns null.
 */
export function renderSafe(Comp, props = {}, name = 'Anonymous') {
  if (!isReactComponent(Comp)) {
    // Don’t throw, just refuse to render so the page survives.
    // eslint-disable-next-line no-console
    console.error(`[renderSafe] Invalid component for <${name}/>`, { received: Comp, typeof: typeof Comp });
    return null;
  }
  return React.createElement(Comp, props);
}
