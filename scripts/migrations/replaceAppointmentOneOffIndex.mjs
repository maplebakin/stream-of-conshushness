import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import Appointment from '../../models/Appointment.js';
import { logSafeError } from '../../utils/errorHandler.js';

export const APPOINTMENT_ONE_OFF_INDEX_KEY = {
  userId: 1,
  date: 1,
  timeStart: 1,
  title: 1,
};

export const APPOINTMENT_ONE_OFF_INDEX_OPTIONS = {
  name: 'appointment_one_off_unique_v2',
  unique: true,
  partialFilterExpression: { date: { $type: 'string' } },
};

function sameIndexKey(candidate = {}) {
  const expectedEntries = Object.entries(APPOINTMENT_ONE_OFF_INDEX_KEY);
  const candidateEntries = Object.entries(candidate || {});
  return candidateEntries.length === expectedEntries.length
    && expectedEntries.every(([field, direction], index) => (
      candidateEntries[index]?.[0] === field && candidateEntries[index]?.[1] === direction
    ));
}

function isDesiredIndex(index = {}) {
  return index.name === APPOINTMENT_ONE_OFF_INDEX_OPTIONS.name
    && index.unique === true
    && sameIndexKey(index.key)
    && index.partialFilterExpression?.date?.$type === 'string'
    && index.sparse !== true;
}

export function appointmentOneOffIndexPlan(indexes = []) {
  return {
    desiredPresent: indexes.some(isDesiredIndex),
    legacyIndexNames: indexes
      .filter((index) => (
        index.name !== APPOINTMENT_ONE_OFF_INDEX_OPTIONS.name
        && index.unique === true
        && index.sparse === true
        && sameIndexKey(index.key)
      ))
      .map((index) => index.name),
  };
}

export function migrationMode(argv = []) {
  const flags = new Set(argv);
  const unknown = [...flags].filter((flag) => !['--apply', '--dry-run'].includes(flag));
  if (unknown.length) throw new Error('Unknown migration option. Use --dry-run or --apply.');
  if (flags.has('--apply') && flags.has('--dry-run')) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  return { apply: flags.has('--apply') };
}

export function requiredMongoUri(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
    throw new Error('MONGODB_URI is required and must be a MongoDB connection URL.');
  }
  return mongoUri;
}

export async function replaceAppointmentOneOffIndex({
  apply = false,
  mongoUri = requiredMongoUri(),
} = {}) {
  await mongoose.connect(mongoUri, { autoIndex: false });
  try {
    let indexes = [];
    try {
      indexes = await Appointment.collection.listIndexes().toArray();
    } catch (error) {
      if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') throw error;
    }

    const plan = appointmentOneOffIndexPlan(indexes);
    if (!apply) return plan;

    if (!plan.desiredPresent) {
      await Appointment.collection.createIndex(
        APPOINTMENT_ONE_OFF_INDEX_KEY,
        APPOINTMENT_ONE_OFF_INDEX_OPTIONS,
      );
    }

    // The replacement is created first. A creation failure therefore leaves
    // the legacy uniqueness guard intact rather than opening an integrity gap.
    for (const name of plan.legacyIndexNames) {
      await Appointment.collection.dropIndex(name);
    }

    return {
      ...plan,
      desiredPresent: true,
      removedLegacyIndexes: plan.legacyIndexNames.length,
    };
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const { apply } = migrationMode(process.argv.slice(2));
  const result = await replaceAppointmentOneOffIndex({ apply, mongoUri: requiredMongoUri() });
  console.log(
    apply
      ? `Appointment index migration complete; removed ${result.removedLegacyIndexes || 0} legacy index(es).`
      : `Appointment index migration dry run; replacement present: ${result.desiredPresent}; legacy index(es): ${result.legacyIndexNames.length}.`,
  );
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main().catch((error) => {
    logSafeError('Appointment index migration failed', error);
    process.exitCode = 1;
  });
}
