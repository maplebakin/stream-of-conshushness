import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Task from '../models/Task.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');

  // Fill missing/empty titles
  const r1 = await Task.updateMany(
    { $or: [ { title: { $exists: false } }, { title: '' } ] },
    { $set: { title: '(untitled)' } }
  );
  console.log('Titles patched:', r1.modifiedCount);

  // Coerce string priorities → numbers
  const map = { low: 1, medium: 2, med: 2, high: 3, h: 3, l: 1, m: 2 };
  const bads = await Task.find({ priority: { $type: 'string' } }, '_id priority').lean();
  let fixed = 0;
  for (const d of bads) {
    const s = String(d.priority).toLowerCase();
    const n = Number.isFinite(Number(d.priority)) ? Number(d.priority) : (map[s] ?? 0);
    await Task.updateOne({ _id: d._id }, { $set: { priority: n } });
    fixed++;
  }
  console.log('Priorities coerced:', fixed);

  await mongoose.disconnect();
  console.log('✅ Done');
}

run().catch(e => { console.error(e); process.exit(1); });
