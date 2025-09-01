import React, { memo, useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * Sanitizes and renders trusted-enough HTML. Keeps bold/italics/lists, scrubs scripts.
 */
export default memo(function SafeHTML({ html = '', className = '' }) {
  const clean = useMemo(() => {
    if (typeof html !== 'string' || !html.trim()) return '';
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'],
      FORBID_ATTR: ['onerror','onload','onclick','onmouseover'],
    });
  }, [html]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
});
