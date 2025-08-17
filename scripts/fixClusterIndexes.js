// scripts/fixClusterIndexes.js
import mongoose from 'mongoose';
import Cluster from '../models/Cluster.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yourdb';

(async () => {
  await mongoose.connect(MONGODB_URI);

  const indexes = await Cluster.collection.getIndexes();
  // Drop a legacy unique on { key: 1 } if present
  for (const [name, def] of Object.entries(indexes)) {
    if (def.key && def.key.key === 1 && name !== 'userId_1_key_1') {
      console.log('Dropping legacy index:', name, def);
      try { await Cluster.collection.dropIndex(name); } catch (e) { console.warn('dropIndex:', e.message); }
    }
  }

  console.log('Rebuilding indexes…');
  await Cluster.syncIndexes();
  console.log('Done.');
  await mongoose.disconnect();
})();
