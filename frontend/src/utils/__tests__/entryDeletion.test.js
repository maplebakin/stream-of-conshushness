import { describe, expect, it, vi } from 'vitest';
import {
  confirmAndDeleteEntry,
  confirmAndTrashEntry,
  getEntryDeleteConfirmationMessage,
  getEntryTrashConfirmationMessage,
} from '../entryDeletion.js';

describe('entry deletion confirmation', () => {
  it('describes entry deletion as moving the entry to trash', () => {
    expect(getEntryTrashConfirmationMessage({ title: 'Journal draft' })).toBe(
      'Move "Journal draft" to trash? You can restore it later.'
    );
    expect(getEntryDeleteConfirmationMessage({ title: 'Journal draft' })).toBe(
      'Move "Journal draft" to trash? You can restore it later.'
    );
  });

  it('does not call the delete request when confirmation is cancelled', async () => {
    const deleteRequest = vi.fn();
    const confirmDelete = vi.fn(() => false);

    const result = await confirmAndTrashEntry({
      entry: { _id: 'entry-1', title: 'Call the dentist' },
      confirmDelete,
      deleteRequest,
    });

    expect(confirmDelete).toHaveBeenCalledWith(
      'Move "Call the dentist" to trash? You can restore it later.'
    );
    expect(deleteRequest).not.toHaveBeenCalled();
    expect(result).toEqual({ confirmed: false, deleted: false });
  });

  it('calls the delete request after confirmation', async () => {
    const deleteRequest = vi.fn().mockResolvedValue({ ok: true });
    const onDeleted = vi.fn();
    const confirmDelete = vi.fn(() => true);

    const result = await confirmAndTrashEntry({
      entry: { _id: 'entry-2', title: 'Buy milk' },
      confirmDelete,
      deleteRequest,
      onDeleted,
    });

    expect(confirmDelete).toHaveBeenCalledWith(
      'Move "Buy milk" to trash? You can restore it later.'
    );
    expect(deleteRequest).toHaveBeenCalledWith('entry-2');
    expect(onDeleted).toHaveBeenCalledWith('entry-2');
    expect(result).toEqual({ confirmed: true, deleted: true });
  });

  it('keeps the legacy helper name working through the trash helper', async () => {
    const deleteRequest = vi.fn().mockResolvedValue({ ok: true });
    const confirmDelete = vi.fn(() => true);

    const result = await confirmAndDeleteEntry({
      entry: { _id: 'entry-3', title: 'Legacy call site' },
      confirmDelete,
      deleteRequest,
    });

    expect(confirmDelete).toHaveBeenCalledWith(
      'Move "Legacy call site" to trash? You can restore it later.'
    );
    expect(deleteRequest).toHaveBeenCalledWith('entry-3');
    expect(result).toEqual({ confirmed: true, deleted: true });
  });
});
