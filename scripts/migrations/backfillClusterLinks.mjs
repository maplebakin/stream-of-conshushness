import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import Entry from '../../models/Entry.js';
import Task from '../../models/Task.js';
import Goal from '../../models/Goal.js';
import Appointment from '../../models/Appointment.js';
import Note from '../../models/Note.js';
import Cluster, { slugifyClusterSlug } from '../../models/Cluster.js';
import { logSafeError } from '../../utils/errorHandler.js';

const { ObjectId } = mongoose.Types;

const SPECS = [
  { model: Entry, name: 'Entry', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
  { model: Task, name: 'Task', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
  { model: Goal, name: 'Goal', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
  { model: Appointment, name: 'Appointment', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
  { model: Note, name: 'Note', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
];

const clusterCache = new Map();

function canonicalObjectId(value) {
  if (!value) return null;
  const stringValue = value instanceof ObjectId
    ? value.toString()
    : typeof value === 'string'
      ? value.trim()
      : value?.toString?.();
  if (!stringValue || !ObjectId.isValid(stringValue)) return null;
  return new ObjectId(stringValue).toString();
}

function clusterLookup(clusters = []) {
  const lookup = {
    byId: new Set(),
    bySlug: new Map(),
    byName: new Map(),
  };

  for (const cluster of clusters) {
    const id = canonicalObjectId(cluster?._id);
    if (!id) continue;
    lookup.byId.add(id);
    if (cluster.slug) lookup.bySlug.set(String(cluster.slug).trim().toLowerCase(), id);
    if (cluster.name) lookup.byName.set(String(cluster.name).trim().toLowerCase(), id);
  }

  return lookup;
}

function resolveLegacyValue(value, lookup) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const objectId = canonicalObjectId(normalized);
  if (objectId) return lookup.byId.has(objectId) ? objectId : null;

  const lower = normalized.toLowerCase();
  const slug = slugifyClusterSlug(normalized);
  return lookup.bySlug.get(slug)
    || lookup.bySlug.get(lower)
    || lookup.byName.get(lower)
    || null;
}

/**
 * Produce an owner-scoped migration plan without touching the database.
 * ObjectIds are retained only when they belong to the document owner; this
 * prevents legacy or corrupt cross-owner links from being made permanent.
 */
export function planOwnedClusterLinks({ currentValues = [], legacyValues = [], ownerClusters = [] } = {}) {
  const lookup = clusterLookup(ownerClusters);
  const finalIds = [];
  const seenIds = new Set();
  const unresolvedLegacy = new Set();
  let droppedForeignOrMissing = 0;

  const addId = (id) => {
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    finalIds.push(id);
  };

  const legacyCandidates = new Set(
    legacyValues.map((value) => String(value || '').trim()).filter(Boolean)
  );

  for (const value of currentValues) {
    const objectId = canonicalObjectId(value);
    if (objectId) {
      if (lookup.byId.has(objectId)) addId(objectId);
      else droppedForeignOrMissing += 1;
      continue;
    }

    const legacy = typeof value === 'string' ? value.trim() : '';
    if (legacy) legacyCandidates.add(legacy);
  }

  for (const value of legacyCandidates) {
    const resolved = resolveLegacyValue(value, lookup);
    if (resolved) addId(resolved);
    else if (canonicalObjectId(value)) droppedForeignOrMissing += 1;
    else unresolvedLegacy.add(value);
  }

  const currentComparable = currentValues
    .map((value) => canonicalObjectId(value) || (typeof value === 'string' ? value.trim() : null))
    .filter(Boolean);
  const changed = currentComparable.length !== finalIds.length
    || currentComparable.some((value, index) => value !== finalIds[index]);

  return {
    changed,
    finalIds,
    droppedForeignOrMissing,
    unresolvedLegacy: unresolvedLegacy.size,
  };
}

async function loadOwnerClusters(ownerId) {
  const key = ownerId.toString();
  if (clusterCache.has(key)) return clusterCache.get(key);

  const clusters = await Cluster.find({ ownerId }).select('_id slug name').lean();
  clusterCache.set(key, clusters);
  return clusters;
}

function legacyValuesFrom(doc, fields = []) {
  return fields
    .map((field) => doc[field])
    .filter((value) => typeof value === 'string' && value.trim());
}

async function backfillModel({ model, name, ownerField, arrayField, legacyFields = [] }, { apply }) {
  const summary = {
    name,
    processed: 0,
    wouldUpdate: 0,
    updated: 0,
    droppedForeignOrMissing: 0,
    unresolvedLegacy: 0,
  };
  const projection = {
    [arrayField]: 1,
    [ownerField]: 1,
    ...Object.fromEntries(legacyFields.map((field) => [field, 1])),
  };
  const cursor = model.find({}, projection).lean().cursor();

  for await (const doc of cursor) {
    summary.processed += 1;
    const ownerId = doc[ownerField];
    if (!ownerId) continue;

    const plan = planOwnedClusterLinks({
      currentValues: Array.isArray(doc[arrayField]) ? doc[arrayField] : [],
      legacyValues: legacyValuesFrom(doc, legacyFields),
      ownerClusters: await loadOwnerClusters(ownerId),
    });
    summary.droppedForeignOrMissing += plan.droppedForeignOrMissing;
    summary.unresolvedLegacy += plan.unresolvedLegacy;
    if (!plan.changed) continue;

    summary.wouldUpdate += 1;
    if (!apply) continue;

    const result = await model.updateOne(
      { _id: doc._id, [ownerField]: ownerId },
      { $set: { [arrayField]: plan.finalIds.map((id) => new ObjectId(id)) } }
    );
    summary.updated += result.modifiedCount || 0;
  }

  return summary;
}

export function migrationMode(argv = []) {
  const flags = new Set(argv);
  const knownFlags = new Set(['--apply', '--dry-run']);
  const unknown = [...flags].filter((flag) => !knownFlags.has(flag));
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

export async function runMigration({ apply = false, mongoUri = requiredMongoUri() } = {}) {
  clusterCache.clear();
  await mongoose.connect(mongoUri);
  try {
    const results = [];
    for (const spec of SPECS) {
      const summary = await backfillModel(spec, { apply });
      results.push(summary);
      console.log(
        `[${summary.name}] processed ${summary.processed}, `
        + `${apply ? 'updated' : 'would update'} ${apply ? summary.updated : summary.wouldUpdate}, `
        + `foreign/missing references ${summary.droppedForeignOrMissing}, `
        + `unresolved legacy values ${summary.unresolvedLegacy}`
      );
    }
    return results;
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const { apply } = migrationMode(process.argv.slice(2));
  console.log(apply ? 'Cluster link backfill running in APPLY mode.' : 'Cluster link backfill dry run; no records will be changed.');
  await runMigration({ apply, mongoUri: requiredMongoUri() });
  console.log(apply ? 'Cluster link backfill complete.' : 'Dry run complete. Re-run with --apply after reviewing the counts.');
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main().catch((error) => {
    logSafeError('Cluster link backfill failed', error);
    process.exitCode = 1;
  });
}
