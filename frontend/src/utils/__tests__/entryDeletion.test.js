import { describe, expect, it, vi } from 'vitest';
import {
  confirmAndDeleteEntry,
  getEntryDeleteConfirmationMessage,
} from '../entryDeletion.js';

describe('entry deletion confirmation', () => {
  it('warns that entry deletion is permanent', () => {
    expect(getEntryDeleteConfirmationMessage({ title: 'Journal draft' })).toBe(
      'Delete "Journal draft" permanently? This cannot be undone.'
    );
  });

  it('does not call the delete request when confirmation is cancelled', async () => {
    const deleteRequest = vi.fn();
    const confirmDelete = vi.fn(() => false);

    const result = await confirmAndDeleteEntry({
      entry: { _id: 'entry-1', title: 'Call the dentist' },
      confirmDelete,
      deleteRequest,
    });

    expect(confirmDelete).toHaveBeenCalledWith(
      'Delete "Call the dentist" permanently? This cannot be undone.'
    );
    expect(deleteRequest).not.toHaveBeenCalled();
    expect(result).toEqual({ confirmed: false, deleted: false });
  });

  it('calls the delete request after confirmation', async () => {
    const deleteRequest = vi.fn().mockResolvedValue({ ok: true });
    const onDeleted = vi.fn();
    const confirmDelete = vi.fn(() => true);

    const result = await confirmAndDeleteEntry({
      entry: { _id: 'entry-2', title: 'Buy milk' },
      confirmDelete,
      deleteRequest,
      onDeleted,
    });

    expect(confirmDelete).toHaveBeenCalledWith(
      'Delete "Buy milk" permanently? This cannot be undone.'
    );
    expect(deleteRequest).toHaveBeenCalledWith('entry-2');
    expect(onDeleted).toHaveBeenCalledWith('entry-2');
    expect(result).toEqual({ confirmed: true, deleted: true });
  });
});
