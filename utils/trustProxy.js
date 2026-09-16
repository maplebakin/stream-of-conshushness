const MAX_TRUSTED_PROXY_HOPS = 10;

/**
 * Express must only trust forwarding headers when the deployment topology is
 * known. A numeric hop count is explicit and avoids trusting arbitrary
 * client-supplied X-Forwarded-For values on directly exposed servers.
 */
export function parseTrustedProxyHops(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === '0') return false;
  if (!/^\d+$/.test(normalized)) return false;

  const hops = Number(normalized);
  return Number.isSafeInteger(hops) && hops >= 1 && hops <= MAX_TRUSTED_PROXY_HOPS
    ? hops
    : false;
}

