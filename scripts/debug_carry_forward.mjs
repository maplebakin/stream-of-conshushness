// scripts/debug_carry_forward.mjs
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Task from '../models/Task.js';

dotenv.config();

const MONGO = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/stream';
const DATE = process.argv[2];                    // e.g. 2025-09-08
const CLUSTER = process.argv[3] || '';           // optional
const USER_ID = process.env.USER_ID || '';       // optional exact filter

if (!DATE) {
  console.error('Usage: node scripts/debug_carry_forward.mjs YYYY-MM-DD [ClusterName]');
  process.exit(1);
}

function pad(n){ return String(n).padStart(2,'0'); }
function norm(d){
  const [y,m,d2] = String(d).split('-');
  return `${y}-${pad(Number(m))}-${pad(Number(d2))}`;
}
const padded = norm(DATE);
const sloppy = (() => {
  const [y,m,d] = DATE.split('-');
  return `${y}-${Number(m)}-${Number(d)}`;
})();

function dateRangeUTC(iso) {
  // midnight range in UTC for that ISO day (best-effort)
  const start = new Date(`${iso}T00:00:00.000Z`);
  const end   = new Date(`${iso}T23:59:59.999Z`);
  return { start, end };
}

const { start, end } = dateRangeUTC(padded);

(async () => {
  await mongoose.connect(MONGO);

  const matchBase = { completed: false };
  if (USER_ID) matchBase.userId = USER_ID;

  // Build flexible date match to handle string or Date storage
  const dateMatch = {
    $or: [
      { dueDate: padded },             // exact string
      { dueDate: sloppy },             // unpadded string
      { dueDate: new Date(padded) },   // exact Date at midnight local?
      { dueDate: { $gte: start, $lte: end } }, // Date range
    ],
  };

  const clusterMatch = CLUSTER
    ? { $or: [
        { clusters: CLUSTER },
        { clusters: { $elemMatch: { $regex: `^${CLUSTER.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`, $options: 'i' } } }
      ] }
    : {};

  const match = { ...matchBase, ...dateMatch, ...clusterMatch };

  const totalIncomplete = await Task.countDocuments({ ...matchBase });
  const totalOnDate     = await Task.countDocuments({ ...matchBase, ...dateMatch });
  const totalOnDateCluster = await Task.countDocuments(match);

  const sample = await Task.find(match)
    .select('_id title dueDate clusters completed')
    .limit(10)
    .lean();

  console.log('MONGO:', MONGO);
  console.log('USER_ID filter:', USER_ID || '(none)');
  console.log('DATE:', DATE, '→ padded:', padded, 'sloppy:', sloppy);
  console.log('Totals => incomplete:', totalIncomplete, 'onDate:', totalOnDate, 'onDate+cluster:', totalOnDateCluster);
  console.log('Sample matches (up to 10):');
  for (const t of sample) {
    console.log(' •', String(t._id), JSON.stringify({
      title: t.title,
      dueDate: t.dueDate,
      clusters: t.clusters,
      completed: t.completed
    }));
  }

  if (!totalOnDate) {
    // show nearby days for hints
    const near = await Task.aggregate([
      { $match: matchBase },
      { $project: {
          d: {
            $cond: [
              { $eq: [ { $type: '$dueDate' }, 'string' ] },
              '$dueDate',
              { $dateToString: { date: '$dueDate', format: '%Y-%m-%d' } }
            ]
          }
        }
      },
      { $group: { _id: '$d', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 15 }
    ]);
    console.log('\nNo tasks matched that date. Here are up to 15 distinct dueDate buckets I can see:');
    near.forEach(n => console.log(' -', n._id, '→', n.count));
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
