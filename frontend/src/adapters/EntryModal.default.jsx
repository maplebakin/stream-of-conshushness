// adapters/EntryModal.default.jsx
import * as Mod from '../EntryModal.jsx';
const C = (Mod && (Mod.default || Object.values(Mod).find(v => typeof v === 'function'))) || (() => null);
export default C;
