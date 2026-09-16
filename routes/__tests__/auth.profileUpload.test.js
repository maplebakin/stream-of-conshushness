import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const oldFileId = '11111111-1111-4111-8111-111111111111';
const nextFileId = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  user: null,
  nextUpload: null,
  findById: vi.fn(),
  findOne: vi.fn(),
  uploadFindOne: vi.fn(),
  retireOwnedUpload: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user-a' };
    next();
  },
}));

vi.mock('../../models/User.js', () => ({
  default: {
    findById: (...args) => mocks.findById(...args),
    findOne: (...args) => mocks.findOne(...args),
  },
}));

vi.mock('../../models/Upload.js', () => ({
  default: {
    findOne: (...args) => mocks.uploadFindOne(...args),
  },
}));

vi.mock('../../utils/upload.js', () => ({
  retireOwnedUpload: (...args) => mocks.retireOwnedUpload(...args),
}));

const router = (await import('../auth.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

function reset() {
  mocks.user = {
    _id: 'user-a',
    username: 'alice',
    email: '',
    pendingEmail: '',
    isAdmin: false,
    profilePicture: `/api/upload/${oldFileId}`,
    save: vi.fn().mockResolvedValue(undefined),
  };
  mocks.nextUpload = {
    fileId: nextFileId,
    ownerId: 'user-a',
    mimeType: 'image/png',
    resourceType: 'unattached',
    resourceId: null,
    save: vi.fn().mockResolvedValue(undefined),
  };
  mocks.findById.mockResolvedValue(mocks.user);
  mocks.uploadFindOne.mockResolvedValue(mocks.nextUpload);
  mocks.retireOwnedUpload.mockResolvedValue(true);
}

describe('profile picture private upload lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  it('accepts only the owner’s private image URL and retires the previous upload on replacement', async () => {
    const res = await request(makeApp())
      .patch('/api/me')
      .send({ profilePicture: `/api/upload/${nextFileId}` })
      .expect(200);

    expect(mocks.uploadFindOne).toHaveBeenCalledWith({
      fileId: nextFileId,
      ownerId: 'user-a',
      deletedAt: null,
    });
    expect(mocks.nextUpload).toMatchObject({ resourceType: 'profile-picture', resourceId: 'user-a' });
    expect(mocks.nextUpload.save).toHaveBeenCalledOnce();
    expect(mocks.user.profilePicture).toBe(`/api/upload/${nextFileId}`);
    expect(mocks.retireOwnedUpload).toHaveBeenCalledWith(oldFileId, 'user-a');
    expect(res.body.user.profilePicture).toBe(`/api/upload/${nextFileId}`);
  });

  it('retires a private profile upload when the picture is removed', async () => {
    await request(makeApp()).patch('/api/me').send({ profilePicture: '' }).expect(200);

    expect(mocks.user.profilePicture).toBe('');
    expect(mocks.retireOwnedUpload).toHaveBeenCalledWith(oldFileId, 'user-a');
  });

  it('does not accept arbitrary or another user’s profile image URLs', async () => {
    mocks.uploadFindOne.mockResolvedValueOnce(null);
    await request(makeApp()).patch('/api/me').send({ profilePicture: `/api/upload/${nextFileId}` }).expect(400);
    await request(makeApp()).patch('/api/me').send({ profilePicture: 'https://example.invalid/avatar.png' }).expect(400);
    expect(mocks.retireOwnedUpload).not.toHaveBeenCalled();
  });
});
