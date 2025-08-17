// adapters/_pick.js
const isValidComponent = (v) =>
  typeof v === 'function' || (v && typeof v === 'object' && '$$typeof' in v);

// Prefer default if valid, else first valid function-like export.
export const pickComponent = (Mod) => {
  if (!Mod || typeof Mod !== 'object') return null;
  if (isValidComponent(Mod.default)) return Mod.default;
  const values = Object.values(Mod);
  const found = values.find(isValidComponent);
  return found || null;
};
