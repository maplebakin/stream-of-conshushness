// adapters/TaskList.default.jsx
import * as Mod from '../TaskList.jsx';
const C = (Mod && (Mod.default || Object.values(Mod).find(v => typeof v === 'function'))) || (() => null);
export default C;
