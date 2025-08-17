// adapters/DailyRipples.default.jsx
import * as Mod from '../DailyRipples.jsx';   // ← COMPONENT path
export default (Mod && (Mod.default || Object.values(Mod).find(v => typeof v === 'function'))) || (() => null);


