function entryLabel(entry) {
  const candidates = [
    entry?.title,
    entry?.text,
    entry?.content,
    entry?.html,
  ];

  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const label = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (label) return label.slice(0, 80);
  }

  return 'this entry';
}

export function getEntryDeleteConfirmationMessage(entry) {
  const label = entryLabel(entry);
  return `Delete "${label}" permanently? This cannot be undone.`;
}

export async function confirmAndDeleteEntry({
  entry,
  confirmDelete = () => true,
  deleteRequest,
  onDeleted,
}) {
  const id = entry?._id;
  if (!id || typeof deleteRequest !== 'function') {
    return { confirmed: false, deleted: false };
  }

  const confirmed = confirmDelete(getEntryDeleteConfirmationMessage(entry));
  if (!confirmed) {
    return { confirmed: false, deleted: false };
  }

  await deleteRequest(id);
  onDeleted?.(id);
  return { confirmed: true, deleted: true };
}
