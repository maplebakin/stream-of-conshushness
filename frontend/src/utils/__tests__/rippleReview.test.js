import { describe, expect, it } from 'vitest';
import { standaloneRippleReviewPath } from '../rippleReview.js';

describe('standalone ripple review path', () => {
  it('always requests the server-side standalone safety filter', () => {
    expect(standaloneRippleReviewPath('2026-07-13')).toBe(
      '/api/ripples?date=2026-07-13&standalone=1'
    );
  });

  it('encodes the supplied day instead of allowing query injection', () => {
    expect(standaloneRippleReviewPath('2026-07-13&standalone=0')).toBe(
      '/api/ripples?date=2026-07-13%26standalone%3D0&standalone=1'
    );
  });
});
