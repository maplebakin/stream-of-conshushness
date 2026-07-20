import Entry from '../models/Entry.js';
import { logSafeError } from './errorHandler.js';

function idOf(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function isoDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceExcerpt(entry) {
  const text = plainText(entry?.text || entry?.content || entry?.html || '');
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
}

export function sourceIdsFrom(items = [], getId = (item) => item?.entryId) {
  return [...new Set((items || []).map(getId).map(idOf).filter(Boolean))];
}

export async function resolveSourceEntries({ userId, sourceIds = [] }) {
  const ids = [...new Set((sourceIds || []).map(idOf).filter(Boolean))];
  if (!ids.length) return new Map();

  try {
    const query = Entry.find({ userId, _id: { $in: ids } });
    const selected = query?.select
      ? query.select('_id date title text content html deletedAt')
      : query;
    const entries = selected?.lean ? await selected.lean() : await selected;
    return new Map((entries || []).map((entry) => [idOf(entry), entry]));
  } catch (err) {
    logSafeError('source entry resolution failed', err);
    return new Map();
  }
}

export function sourceEntryMeta(sourceMap, sourceEntryId, { includeExcerpt = false } = {}) {
  const id = idOf(sourceEntryId);
  if (!id) return {};

  const entry = sourceMap?.get(id);
  if (!entry) {
    return { sourceEntryId: id, sourceState: 'missing', sourceAvailable: false };
  }
  if (entry.deletedAt) {
    return { sourceEntryId: id, sourceState: 'trashed', sourceAvailable: false };
  }

  const sourceEntryDate = isoDate(entry.date);
  return {
    sourceEntryId: id,
    sourceEntryDate,
    sourceDate: sourceEntryDate,
    sourceTitle: entry.title || '',
    sourceState: 'active',
    sourceAvailable: true,
    ...(includeExcerpt ? { sourceEntryExcerpt: sourceExcerpt(entry) } : {}),
  };
}

export const __testables = { idOf, sourceExcerpt };
