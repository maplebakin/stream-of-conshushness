import { describe, expect, it } from 'vitest';
import { parseTrustedProxyHops } from '../trustProxy.js';

describe('parseTrustedProxyHops', () => {
  it('does not trust forwarding headers by default', () => {
    expect(parseTrustedProxyHops()).toBe(false);
    expect(parseTrustedProxyHops('')).toBe(false);
    expect(parseTrustedProxyHops('0')).toBe(false);
  });

  it('accepts an explicit, bounded proxy hop count', () => {
    expect(parseTrustedProxyHops('1')).toBe(1);
    expect(parseTrustedProxyHops(' 2 ')).toBe(2);
  });

  it('fails closed for broad or invalid trust settings', () => {
    expect(parseTrustedProxyHops('true')).toBe(false);
    expect(parseTrustedProxyHops('-1')).toBe(false);
    expect(parseTrustedProxyHops('11')).toBe(false);
    expect(parseTrustedProxyHops('127.0.0.1')).toBe(false);
  });
});
