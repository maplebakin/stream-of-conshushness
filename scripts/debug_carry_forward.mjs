// scripts/debug_carry_forward.mjs
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Task from '../models/Task.js';
import { mongoUriDiagnostic } from './safeDiagnostics.mjs';
import { logSafeError } from '../utils/errorHandler.js';
import {
  isMaintenanceInputError,
  requiredMongoUri,
  requiredOwnerId,
} from './maintenanceSafety.mjs';

function pad(n){ return String(n).padStart(2,'0'); }

export function normalizedIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const iso = `${year}-${pad(Number(month))}-${pad(Number(day))}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

function dateRangeUTC(iso) {
  // midnight range in UTC for that ISO day (best-effort)
  const start = new Date(`${iso}T00:00:00.000Z`);
  const end   = new Date(`${iso}T23:59:59.999Z`);
  return { start, end };
}

export async function runCarryForwardDiagnostic({
  mongoUri = requiredMongoUri(),
  ownerId = requiredOwnerId(),
  date,
  cluster = '',
} = {}) {
  const padded = normalizedIsoDate(date);
  if (!padded) throw new Error('Invalid diagnostic date.');
  const [, month, day] = padded.split('-');
  const sloppy = `${padded.slice(0, 4)}-${Number(month)}-${Number(day)}`;
  const { start, end } = dateRangeUTC(padded);

  await mongoose.connect(mongoUri);
  try {
    const matchBase = {
      completed: false,
      userId: new mongoose.Types.ObjectId(ownerId),
    };

    // Build flexible date match to handle string or Date storage.
    const dateMatch = {
      $or: [
        { dueDate: padded },
        { dueDate: sloppy },
        { dueDate: new Date(`${padded}T00:00:00.000Z`) },
        { dueDate: { $gte: start, $lte: end } },
      ],
    };

    const escapedCluster = cluster.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const clusterMatch = cluster
      ? mongoose.Types.ObjectId.isValid(cluster)
        ? { clusters: new mongoose.Types.ObjectId(cluster) }
        : { cluster: { $regex: `^${escapedCluster}$`, $options: 'i' } }
      : {};

    const match = {
      ...matchBase,
      $and: cluster ? [dateMatch, clusterMatch] : [dateMatch],
    };

    const totalIncomplete = await Task.countDocuments(matchBase);
    const totalOnDate = await Task.countDocuments({ ...matchBase, ...dateMatch });
    const totalOnDateCluster = await Task.countDocuments(match);

    const sample = await Task.find(match)
      .select('_id dueDate clusters completed')
      .limit(10)
      .lean();

    const MONGO = mongoUri;
    console.log(mongoUriDiagnostic(MONGO));
    console.log('USER_ID filter: configured');
    console.log('DATE:', date, '→ normalized:', padded);
    console.log('Totals => incomplete:', totalIncomplete, 'onDate:', totalOnDate, 'onDate+cluster:', totalOnDateCluster);
    console.log('Sample matches without task text (up to 10):');
    for (const task of sample) {
      console.log(' •', String(task._id), JSON.stringify({
        dueDate: task.dueDate,
        clusterCount: Array.isArray(task.clusters) ? task.clusters.length : 0,
        completed: task.completed,
      }));
    }

    if (!totalOnDate) {
      const near = await Task.aggregate([
        { $match: matchBase },
        { $project: {
            d: {
              $cond: [
                { $eq: [{ $type: '$dueDate' }, 'string'] },
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
      console.log('\nNo tasks matched that date. Up to 15 owned due-date buckets:');
      near.forEach((bucket) => console.log(' -', bucket._id, '→', bucket.count));
    }

    return { totalIncomplete, totalOnDate, totalOnDateCluster, sampleCount: sample.length };
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  dotenv.config({ quiet: true });
  const date = process.argv[2];
  const cluster = process.argv[3] || '';
  if (!date || !normalizedIsoDate(date) || process.argv.length > 4) {
    console.error('Usage: USER_ID=<owner-id> MONGODB_URI=<uri> node scripts/debug_carry_forward.mjs YYYY-MM-DD [ClusterName]');
    process.exitCode = 1;
    return;
  }
  if (cluster.length > 100) {
    console.error('Cluster filter must be 100 characters or fewer.');
    process.exitCode = 1;
    return;
  }

  await runCarryForwardDiagnostic({
    mongoUri: requiredMongoUri(),
    ownerId: requiredOwnerId(),
    date,
    cluster,
  });
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main().catch((error) => {
    if (isMaintenanceInputError(error)) console.error(error.message);
    else logSafeError('Carry-forward debug failed', error);
    process.exitCode = 1;
  });
}
