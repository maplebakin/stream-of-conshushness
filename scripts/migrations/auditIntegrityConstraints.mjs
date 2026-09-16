import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import Appointment from '../../models/Appointment.js';
import Entry from '../../models/Entry.js';
import GatherItem from '../../models/GatherItem.js';
import Interest from '../../models/Interest.js';
import Note from '../../models/Note.js';
import Ripple from '../../models/Ripple.js';
import Task from '../../models/Task.js';
import User from '../../models/User.js';
import { requiredMongoUri } from '../maintenanceSafety.mjs';
import { logSafeError } from '../../utils/errorHandler.js';

export const INTEGRITY_CHECKS = [
  { name: 'normalized email', model: User, fields: ['emailNormalized'], match: { emailNormalized: { $type: 'string' } } },
  {
    name: 'legacy normalized email identity',
    model: User,
    match: { email: { $type: 'string', $ne: '' } },
    group: {
      emailNormalized: { $toLower: { $trim: { input: '$email' } } },
    },
  },
  { name: 'entry capture receipt', model: Entry, fields: ['userId', 'clientRequestId'], match: { clientRequestId: { $type: 'string' } } },
  { name: 'manual task receipt', model: Task, fields: ['userId', 'clientRequestId'], match: { clientRequestId: { $type: 'string' } } },
  { name: 'task suggestion provenance', model: Task, fields: ['userId', 'sourceSuggestionId'], match: { sourceSuggestionId: { $type: 'objectId' } } },
  { name: 'recurring successor provenance', model: Task, fields: ['userId', 'recurrenceSourceTaskId'], match: { recurrenceSourceTaskId: { $type: 'objectId' } } },
  { name: 'gather suggestion provenance', model: GatherItem, fields: ['userId', 'sourceSuggestionId'], match: { sourceSuggestionId: { $type: 'objectId' } } },
  { name: 'interest suggestion provenance', model: Interest, fields: ['userId', 'sourceSuggestionId'], match: { sourceSuggestionId: { $type: 'objectId' } } },
  {
    name: 'appointment one-off identity',
    model: Appointment,
    fields: ['userId', 'date', 'timeStart', 'title'],
    // Match the replacement partial unique index exactly so this audit can be
    // used as its non-destructive deployment preflight.
    match: { date: { $type: 'string' } },
  },
  { name: 'daily note identity', model: Note, fields: ['userId', 'dailyKey'], match: { dailyKey: { $type: 'string' } } },
  {
    name: 'legacy unclustered daily note identity',
    model: Note,
    fields: ['userId', 'date'],
    // Records created before dailyKey existed are still eligible to become the
    // one Remember This note for a day. Report duplicate legacy candidates
    // before the application promotes one and the unique index takes over.
    match: {
      $and: [
        { $or: [{ dailyKey: { $exists: false } }, { dailyKey: null }] },
        { $or: [{ cluster: { $exists: false } }, { cluster: null }, { cluster: '' }] },
        { $or: [{ clusters: { $exists: false } }, { clusters: { $size: 0 } }] },
      ],
    },
  },
  { name: 'direct ripple analysis receipt', model: Ripple, fields: ['userId', 'analysisKey'], match: { analysisKey: { $type: 'string' } } },
];

export function duplicatePipeline({ fields = [], match, group = null }) {
  return [
    { $match: match },
    { $group: {
      _id: group || Object.fromEntries(fields.map((field) => [field, `$${field}`])),
      count: { $sum: 1 },
    } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'duplicateGroups' },
  ];
}

export async function auditIntegrityConstraints({ mongoUri = requiredMongoUri() } = {}) {
  await mongoose.connect(mongoUri, { autoIndex: false });
  try {
    const results = [];
    for (const check of INTEGRITY_CHECKS) {
      const rows = await check.model.collection.aggregate(duplicatePipeline(check)).toArray();
      results.push({ name: check.name, duplicateGroups: rows[0]?.duplicateGroups || 0 });
    }
    return results;
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => flag !== '--dry-run')) {
    throw new Error('This audit is read-only. The only supported option is --dry-run.');
  }
  const results = await auditIntegrityConstraints();
  for (const result of results) {
    console.log(`${result.name}: ${result.duplicateGroups} duplicate group(s)`);
  }
  if (results.some((result) => result.duplicateGroups > 0)) process.exitCode = 2;
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main().catch((error) => {
    logSafeError('Integrity constraint audit failed', error);
    process.exitCode = 1;
  });
}
