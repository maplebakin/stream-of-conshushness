export function escapeRegex(input='') {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
