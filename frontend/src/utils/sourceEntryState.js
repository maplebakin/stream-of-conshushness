export function sourceStateLabel(item) {
  if (item?.sourceState === 'trashed') return 'Source in Trash';
  if (item?.sourceState === 'missing') return 'Source unavailable';
  return '';
}

export function sourceEntryPath(item) {
  if (item?.sourceState && item.sourceState !== 'active') return '';
  return entryPath({ _id: item?.sourceEntryId, date: item?.sourceDate });
}

export function entryPath(entry) {
  if (!entry?.date) return '';
  const hash = entry?._id ? `#entry-${encodeURIComponent(entry._id)}` : '';
  return `/day/${entry.date}${hash}`;
}

export function sourceIsAvailable(item) {
  return item?.sourceState ? item.sourceState === 'active' : !!item?.sourceDate;
}
