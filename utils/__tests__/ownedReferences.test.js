import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entryFindOne: vi.fn(),
  sectionPageFindOne: vi.fn(),
}));

vi.mock('../../models/Entry.js', () => ({
  default: { findOne: (...args) => mocks.entryFindOne(...args) },
}));
vi.mock('../../models/Goal.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../models/Section.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../models/SectionPage.js', () => ({ default: { findOne: (...args) => mocks.sectionPageFindOne(...args) } }));

const { resolveOwnedEntryId, resolveOwnedSectionPageId } = await import('../ownedReferences.js');

function result(value) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

describe('owned reference resolution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the referenced entry to belong to the authenticated user', async () => {
    const entryId = '507f1f77bcf86cd799439011';
    mocks.entryFindOne.mockReturnValue(result(null));

    await expect(resolveOwnedEntryId('user-a', entryId)).resolves.toBeNull();
    expect(mocks.entryFindOne).toHaveBeenCalledWith({ _id: entryId, userId: 'user-a' });
  });

  it('uses legacy section-page owner aliases only when canonical userId is absent', async () => {
    const pageId = '507f1f77bcf86cd799439012';
    mocks.sectionPageFindOne.mockReturnValue(result(null));

    await expect(resolveOwnedSectionPageId('user-a', pageId)).resolves.toBeNull();
    expect(mocks.sectionPageFindOne).toHaveBeenCalledWith({
      _id: pageId,
      $or: [
        { userId: 'user-a' },
        {
          $and: [
            { userId: { $exists: false } },
            { $or: [{ owner: 'user-a' }, { user: 'user-a' }, { createdBy: 'user-a' }] },
          ],
        },
      ],
    });
  });
});
