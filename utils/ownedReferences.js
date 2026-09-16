import mongoose from 'mongoose';
import Entry from '../models/Entry.js';
import Goal from '../models/Goal.js';
import Section from '../models/Section.js';
import SectionPage from '../models/SectionPage.js';

function idOf(value) {
  if (!value) return null;
  const candidate = typeof value === 'object' && value._id ? value._id : value;
  return mongoose.Types.ObjectId.isValid(candidate) ? candidate : null;
}

async function findOwnedId(Model, filter) {
  const query = Model.findOne(filter);
  const selected = query?.select ? query.select('_id') : query;
  const doc = selected?.lean ? await selected.lean() : await selected;
  return doc?._id || null;
}

/**
 * Prefer the canonical userId whenever it exists. Legacy aliases are accepted
 * only on documents that predate userId, so contradictory historical owner
 * fields cannot grant a second user access.
 */
export function canonicalOrLegacyOwnerQuery(userId) {
  return {
    $or: [
      { userId },
      {
        $and: [
          { userId: { $exists: false } },
          { $or: [{ owner: userId }, { user: userId }, { createdBy: userId }] },
        ],
      },
    ],
  };
}

export async function resolveOwnedEntryId(userId, value) {
  const id = idOf(value);
  if (!userId || !id) return null;
  return findOwnedId(Entry, { _id: id, userId });
}

export async function resolveOwnedGoalId(userId, value) {
  const id = idOf(value);
  if (!userId || !id) return null;
  return findOwnedId(Goal, { _id: id, userId });
}

export async function resolveOwnedSectionId(userId, value) {
  const id = idOf(value);
  if (!userId || !id) return null;
  return findOwnedId(Section, { _id: id, ownerId: userId });
}

export async function resolveOwnedSectionPageId(userId, value) {
  const id = idOf(value);
  if (!userId || !id) return null;
  return findOwnedId(SectionPage, {
    _id: id,
    ...canonicalOrLegacyOwnerQuery(userId),
  });
}

export const __testables = { idOf };
