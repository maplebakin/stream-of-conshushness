import mongoose from 'mongoose';
import Cluster, { slugifyClusterSlug } from '../models/Cluster.js';

const { ObjectId } = mongoose.Types;

export function normalizeClusterIds(raw) {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const seen = new Set();
  const ids = [];

  for (const value of arr) {
    if (value == null || value === '') continue;

    if (value instanceof ObjectId) {
      const key = value.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      ids.push(value);
      continue;
    }

    const str = typeof value === 'string' ? value.trim() : value?.toString?.();
    if (!str) continue;
    if (!ObjectId.isValid(str)) continue;

    const id = new ObjectId(str);
    const key = id.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }

  return ids;
}

export function toObjectId(value) {
  if (value instanceof ObjectId) return value;
  const str = typeof value === 'string' ? value.trim() : value?.toString?.();
  if (!str) return null;
  if (!ObjectId.isValid(str)) return null;
  return new ObjectId(str);
}

export async function resolveClusterIdForOwner(ownerId, value) {
  if (!value) return null;
  const id = toObjectId(value);
  if (id) return id;

  const slug = slugifyClusterSlug(value);
  if (!slug) return null;

  const doc = await Cluster.findOne({ ownerId, slug }).select('_id').lean();
  return doc?._id || null;
}

export async function resolveClusterIdsForOwner(ownerId, values = []) {
  const arr = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const ids = [];

  for (const value of arr) {
    const id = await resolveClusterIdForOwner(ownerId, value);
    if (!id) continue;
    const key = id.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }

  return ids;
}
