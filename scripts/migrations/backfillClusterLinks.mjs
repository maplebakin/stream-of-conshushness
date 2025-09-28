import mongoose from 'mongoose';
import Entry from '../../models/Entry.js';
import Task from '../../models/Task.js';
import Goal from '../../models/Goal.js';
import Appointment from '../../models/Appointment.js';
import Note from '../../models/Note.js';
import Cluster, { slugifyClusterSlug } from '../../models/Cluster.js';

const { ObjectId } = mongoose.Types;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yourdb';

const SPECS = [
  { model: Entry, name: 'Entry', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
  { model: Task, name: 'Task', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
  { model: Goal, name: 'Goal', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
  { model: Appointment, name: 'Appointment', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
  { model: Note, name: 'Note', ownerField: 'userId', arrayField: 'clusters', legacyFields: ['cluster'] },
];

const clusterCache = new Map();

function toObjectIdString(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value.toString();
  const str = typeof value === 'string' ? value.trim() : value?.toString?.();
  if (!str) return null;
  if (!ObjectId.isValid(str)) return null;
  return new ObjectId(str).toString();
}

async function loadClusterCache(ownerId) {
  const key = ownerId.toString();
  if (clusterCache.has(key)) return clusterCache.get(key);

  const clusters = await Cluster.find({ ownerId }).select('_id slug name').lean();
  const data = {
    bySlug: new Map(),
    byName: new Map(),
  };

  for (const cluster of clusters) {
    const idStr = cluster._id.toString();
    if (cluster.slug) data.bySlug.set(cluster.slug, idStr);
    if (cluster.name) data.byName.set(cluster.name.trim().toLowerCase(), idStr);
  }

  clusterCache.set(key, data);
  return data;
}

async function resolveClusterString(ownerId, value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (ObjectId.isValid(trimmed)) return new ObjectId(trimmed).toString();

  const cache = await loadClusterCache(ownerId);
  const slug = slugifyClusterSlug(trimmed);
  if (slug && cache.bySlug.has(slug)) return cache.bySlug.get(slug);
  if (cache.bySlug.has(trimmed)) return cache.bySlug.get(trimmed);
  const lower = trimmed.toLowerCase();
  if (cache.bySlug.has(lower)) return cache.bySlug.get(lower);
  if (cache.byName.has(lower)) return cache.byName.get(lower);
  return null;
}

function collectLegacyStrings(doc, fields = []) {
  const values = new Set();
  for (const field of fields) {
    const raw = doc[field];
    if (typeof raw === 'string' && raw.trim()) values.add(raw.trim());
  }
  return values;
}

function collectArrayCandidates(doc, arrayField) {
  const validIds = new Set();
  const legacyStrings = new Set();
  const arr = doc[arrayField];
  if (!Array.isArray(arr)) return { validIds, legacyStrings };

  for (const value of arr) {
    const idStr = toObjectIdString(value);
    if (idStr) {
      validIds.add(idStr);
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      legacyStrings.add(value.trim());
    }
  }
  return { validIds, legacyStrings };
}

async function backfillModel({ model, name, ownerField, arrayField, legacyFields = [] }) {
  let processed = 0;
  let updated = 0;
  const cursor = model.find({}, { [arrayField]: 1, [ownerField]: 1, ...Object.fromEntries(legacyFields.map((f) => [f, 1])) }).lean().cursor();

  for await (const doc of cursor) {
    processed += 1;
    const ownerId = doc[ownerField];
    if (!ownerId) continue;

    const existingIds = new Set();
    const { validIds, legacyStrings } = collectArrayCandidates(doc, arrayField);
    for (const id of validIds) existingIds.add(id);

    const extraStrings = collectLegacyStrings(doc, legacyFields);
    for (const value of extraStrings) legacyStrings.add(value);

    const resolvedIds = new Set(existingIds);
    for (const value of legacyStrings) {
      const match = await resolveClusterString(ownerId, value);
      if (match) resolvedIds.add(match);
    }

    const finalIds = Array.from(resolvedIds);
    const currentIds = Array.isArray(doc[arrayField])
      ? doc[arrayField]
          .map((v) => {
            if (v instanceof ObjectId) return v.toString();
            if (typeof v === 'string') return v.trim();
            return null;
          })
          .filter(Boolean)
      : [];

    const currentSet = new Set(currentIds);
    let changed = false;
    if (currentSet.size !== finalIds.length) {
      changed = true;
    } else {
      for (const id of finalIds) {
        if (!currentSet.has(id)) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        for (const value of currentSet) {
          if (!finalIds.includes(value)) {
            changed = true;
            break;
          }
        }
      }
    }

    if (!changed) continue;

    await model.updateOne(
      { _id: doc._id },
      { $set: { [arrayField]: finalIds.map((id) => new ObjectId(id)) } }
    );
    updated += 1;
  }

  return { name, processed, updated };
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const results = [];
  for (const spec of SPECS) {
    const summary = await backfillModel(spec);
    results.push(summary);
    console.log(`[${summary.name}] processed ${summary.processed}, updated ${summary.updated}`);
  }
  await mongoose.disconnect();
  return results;
}

main()
  .then(() => {
    console.log('Cluster link backfill complete.');
  })
  .catch((err) => {
    console.error('Cluster link backfill failed:', err);
    process.exitCode = 1;
  });
