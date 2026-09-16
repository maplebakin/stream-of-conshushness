import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Task from '../models/Task.js';
import { logSafeError } from '../utils/errorHandler.js';
import {
  isMaintenanceInputError,
  mutationMode,
  requiredMongoUri,
  requiredOwnerId,
} from './maintenanceSafety.mjs';

export function normalizedLegacyPriority(value) {
  const map = { low: 1, medium: 2, med: 2, high: 3, h: 3, l: 1, m: 2 };
  const normalized = String(value).trim().toLowerCase();
  return Number.isFinite(Number(value)) ? Number(value) : (map[normalized] ?? 0);
}

export async function runBadTaskRepair({
  apply = false,
  mongoUri = requiredMongoUri(),
  ownerId = requiredOwnerId(),
} = {}) {
  await mongoose.connect(mongoUri);
  try {
    const ownerMatch = { userId: new mongoose.Types.ObjectId(ownerId) };
    const missingTitleMatch = {
      ...ownerMatch,
      $or: [{ title: { $exists: false } }, { title: '' }],
    };
    const priorityMatch = { ...ownerMatch, priority: { $type: 'string' } };

    const [missingTitleCount, legacyPriorities] = await Promise.all([
      Task.countDocuments(missingTitleMatch),
      Task.find(priorityMatch).select('_id priority').lean(),
    ]);

    console.log('Tasks that need a fallback title:', missingTitleCount);
    console.log('Legacy priorities that need coercion:', legacyPriorities.length);
    if (!apply) {
      console.log('Dry run complete; no tasks were changed. Re-run with --apply after reviewing the counts.');
      return { missingTitleCount, legacyPriorityCount: legacyPriorities.length, applied: false };
    }

    const titleResult = await Task.updateMany(
      missingTitleMatch,
      { $set: { title: '(untitled)' } }
    );
    let legacyPriorityModifiedCount = 0;
    if (legacyPriorities.length) {
      const priorityResult = await Task.bulkWrite(legacyPriorities.map((task) => ({
        updateOne: {
          filter: { _id: task._id, ...ownerMatch, priority: { $type: 'string' } },
          update: { $set: { priority: normalizedLegacyPriority(task.priority) } },
        },
      })));
      legacyPriorityModifiedCount = priorityResult.modifiedCount || 0;
    }

    console.log('Tasks given a fallback title:', titleResult.modifiedCount || 0);
    console.log('Legacy priorities repaired:', legacyPriorityModifiedCount);
    return {
      missingTitleCount: titleResult.modifiedCount || 0,
      legacyPriorityCount: legacyPriorityModifiedCount,
      applied: true,
    };
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  dotenv.config({ quiet: true });
  const { apply } = mutationMode(process.argv.slice(2));
  console.log(apply ? 'Bad-task repair running in APPLY mode.' : 'Bad-task repair dry run; no tasks will be changed.');
  await runBadTaskRepair({
    apply,
    mongoUri: requiredMongoUri(),
    ownerId: requiredOwnerId(),
  });
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main().catch((error) => {
    if (isMaintenanceInputError(error)) console.error(error.message);
    else logSafeError('Bad-task repair failed', error);
    process.exitCode = 1;
  });
}
