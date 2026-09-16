function randomPart() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function stableRequestId(ref, fingerprint, prefix = 'request') {
  if (!ref?.current || ref.current.fingerprint !== fingerprint) {
    ref.current = {
      fingerprint,
      id: `${prefix}:${randomPart()}`,
    };
  }
  return ref.current.id;
}

export function clearRequestId(ref) {
  if (ref) ref.current = null;
}
