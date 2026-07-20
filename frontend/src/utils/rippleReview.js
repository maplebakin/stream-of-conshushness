export function standaloneRippleReviewPath(dayISO) {
  return `/api/ripples?date=${encodeURIComponent(String(dayISO || ''))}&standalone=1`;
}
