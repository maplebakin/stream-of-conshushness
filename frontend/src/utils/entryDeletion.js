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
  return getEntryTrashConfirmationMessage(entry);
}

export function getEntryTrashConfirmationMessage(entry) {
  const label = entryLabel(entry);
  return `Move "${label}" to trash? You can restore it later.`;
}

export async function confirmAndDeleteEntry({
  entry,
  confirmDelete = () => true,
  deleteRequest,
  onDeleted,
}) {
  return confirmAndTrashEntry({
    entry,
    confirmDelete,
    deleteRequest,
    onDeleted,
  });
}

export async function confirmAndTrashEntry({
  entry,
  confirmDelete = () => true,
  deleteRequest,
  onDeleted,
}) {
  const id = entry?._id;
  if (!id || typeof deleteRequest !== 'function') {
    return { confirmed: false, deleted: false };
  }

  const confirmed = confirmDelete(getEntryTrashConfirmationMessage(entry));
  if (!confirmed) {
    return { confirmed: false, deleted: false };
  }

  await deleteRequest(id);
  onDeleted?.(id);
  return { confirmed: true, deleted: true };
}
