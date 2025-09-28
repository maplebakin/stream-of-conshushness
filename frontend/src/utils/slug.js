export function sanitizeSlug(value = '') {
  const base = String(value ?? '').toLowerCase().trim();
  if (!base) return '';

  return base
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export default sanitizeSlug;
