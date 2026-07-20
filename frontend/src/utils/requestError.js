const SAFE_CODE = /^[A-Z0-9_-]{1,40}$/;

/**
 * Keep browser diagnostics useful without handing Axios a chance to print the
 * request config. POST configs can contain private journal, note, task, or
 * calendar text.
 */
export function requestErrorSummary(error) {
  const status = Number(error?.response?.status);
  const code = typeof error?.code === 'string' && SAFE_CODE.test(error.code)
    ? error.code
    : '';

  const details = [];
  if (Number.isInteger(status) && status >= 100 && status <= 599) {
    details.push(`HTTP ${status}`);
  }
  if (code) details.push(code);

  return details.length > 0
    ? `Request failed (${details.join(', ')})`
    : 'Request failed';
}
