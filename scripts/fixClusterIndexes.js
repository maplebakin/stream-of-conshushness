import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Cluster from '../models/Cluster.js';
import { logSafeError } from '../utils/errorHandler.js';
import {
  isMaintenanceInputError,
  mutationMode,
  requiredMongoUri,
} from './maintenanceSafety.mjs';

export function legacyClusterIndexNames(indexes = []) {
  const list = Array.isArray(indexes)
    ? indexes
    : Object.entries(indexes).map(([name, definition]) => ({ name, ...definition }));

  return list
    .filter((index) => {
      const keys = index?.key && typeof index.key === 'object'
        ? Object.keys(index.key)
        : [];
      return keys.length === 1 && keys[0] === 'key' && index.key.key === 1;
    })
    .map((index) => index.name)
    .filter((name) => typeof name === 'string' && name.length > 0);
}

export async function runClusterIndexRepair({ apply = false, mongoUri = requiredMongoUri() } = {}) {
  await mongoose.connect(mongoUri);
  try {
    const indexes = await Cluster.collection.listIndexes().toArray();
    const legacyNames = legacyClusterIndexNames(indexes);

    console.log(`Legacy unscoped cluster indexes found: ${legacyNames.length}`);
    if (!apply) {
      console.log('Dry run complete; no indexes were changed. Re-run with --apply after reviewing the count.');
      return { legacyIndexCount: legacyNames.length, applied: false };
    }

    for (const name of legacyNames) {
      await Cluster.collection.dropIndex(name);
    }
    // Create declared indexes without dropping any unrelated operator-managed
    // indexes. Only the exact legacy { key: 1 } indexes above are removed.
    await Cluster.createIndexes();
    console.log('Cluster indexes repaired.');
    return { legacyIndexCount: legacyNames.length, applied: true };
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  dotenv.config({ quiet: true });
  const { apply } = mutationMode(process.argv.slice(2));
  console.log(apply ? 'Cluster index repair running in APPLY mode.' : 'Cluster index repair dry run; no indexes will be changed.');
  await runClusterIndexRepair({ apply, mongoUri: requiredMongoUri() });
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main().catch((error) => {
    if (isMaintenanceInputError(error)) console.error(error.message);
    else logSafeError('Cluster index repair failed', error);
    process.exitCode = 1;
  });
}
