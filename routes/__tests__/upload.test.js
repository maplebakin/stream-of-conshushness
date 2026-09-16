import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const privateUploadDir = `${process.cwd()}/.test-private-uploads-${process.pid}`;
  process.env.PRIVATE_UPLOAD_DIR = privateUploadDir;
  return { privateUploadDir, records: [] };
});

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, res, next) => {
    const match = /^Bearer (user-[a-z])$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: 'missing token' });
    req.user = { userId: match[1] };
    return next();
  },
}));

vi.mock('../../models/Upload.js', () => ({
  default: {
    create: (...args) => mocks.create(...args),
    findOne: (...args) => mocks.findOne(...args),
  },
}));

const { MAX_UPLOAD_BYTES } = await import('../../utils/privateUploadStorage.js');
const { default: uploadRouter, retireOwnedUpload } = await import('../../utils/upload.js');

const PNG = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const JPEG = Buffer.from('ffd8ff000000000000000000', 'hex');
const SECRET_FILENAME = '../../PRIVATE_JOURNAL_SENTINEL.png';

function app() {
  const instance = express();
  instance.use('/api/upload', uploadRouter);
  return instance;
}

function findRecord(query) {
  return state.records.find((record) => (
    record.fileId === query.fileId &&
    record.ownerId === query.ownerId &&
    record.deletedAt === query.deletedAt
  )) || null;
}

function modelDocument(record) {
  if (!record) return { lean: vi.fn().mockResolvedValue(null) };
  const document = {
    ...record,
    lean: vi.fn().mockResolvedValue({ ...record }),
  };
  document.save = vi.fn().mockImplementation(async () => {
    Object.assign(record, document);
    return record;
  });
  return document;
}

function uploadImage(user = 'user-a', filename = 'profile.png') {
  return request(app())
    .post('/api/upload')
    .set('Authorization', `Bearer ${user}`)
    .attach('profilePicture', PNG, { filename, contentType: 'image/png' });
}

describe('private upload routes', () => {
  let consoleError;

  beforeEach(() => {
    vi.clearAllMocks();
    fs.rmSync(state.privateUploadDir, { recursive: true, force: true });
    state.records.length = 0;
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.create.mockImplementation(async (payload) => {
      const record = { ...payload, deletedAt: null };
      state.records.push(record);
      return record;
    });
    mocks.findOne.mockImplementation((query) => modelDocument(findRecord(query)));
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  afterAll(() => {
    fs.rmSync(state.privateUploadDir, { recursive: true, force: true });
  });

  it('stores opaque metadata and lets only the owner download an upload', async () => {
    const created = await uploadImage('user-a', SECRET_FILENAME).expect(201);
    const record = state.records[0];

    expect(created.body).toMatchObject({
      id: expect.stringMatching(/^[a-f0-9-]{36}$/i),
      url: expect.stringMatching(/^\/api\/upload\/[a-f0-9-]{36}$/i),
      field: 'profilePicture',
      mimetype: 'image/png',
    });
    expect(created.body.filename).not.toContain('../');
    expect(JSON.stringify(created.body)).not.toContain(state.privateUploadDir);
    expect(record.storageName).toMatch(/^[a-f0-9-]{36}$/i);
    expect(record.storageName).not.toContain('profile');
    expect(record.originalName).not.toContain('../');
    expect(fs.statSync(state.privateUploadDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(state.privateUploadDir, record.storageName)).mode & 0o777).toBe(0o600);

    const ownerDownload = await request(app())
      .get(created.body.url)
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    expect(ownerDownload.headers['content-disposition']).toMatch(/^attachment;/);
    expect(ownerDownload.headers['x-content-type-options']).toBe('nosniff');

    await request(app()).get(created.body.url).expect(401);
    await request(app()).get(created.body.url).set('Authorization', 'Bearer user-b').expect(404);
    await request(app()).get('/api/upload/33333333-3333-4333-8333-333333333333').set('Authorization', 'Bearer user-a').expect(404);
  });

  it('does not collide when original filenames are duplicated and rejects unsafe upload shapes', async () => {
    const first = await uploadImage('user-a', 'same.png').expect(201);
    const second = await uploadImage('user-a', 'same.png').expect(201);
    expect(first.body.url).not.toBe(second.body.url);
    expect(state.records[0].storageName).not.toBe(state.records[1].storageName);

    await request(app())
      .post('/api/upload')
      .set('Authorization', 'Bearer user-a')
      .attach('unexpected', PNG, { filename: 'bad.png', contentType: 'image/png' })
      .expect(400);
    await request(app())
      .post('/api/upload')
      .set('Authorization', 'Bearer user-a')
      .attach('profilePicture', PNG, { filename: 'one.png', contentType: 'image/png' })
      .attach('profilePicture', PNG, { filename: 'two.png', contentType: 'image/png' })
      .expect(400);
    await request(app())
      .post('/api/upload')
      .set('Authorization', 'Bearer user-a')
      .attach('profilePicture', Buffer.alloc(0), { filename: 'empty.png', contentType: 'image/png' })
      .expect(400);
    await request(app())
      .post('/api/upload')
      .set('Authorization', 'Bearer user-a')
      .attach('profilePicture', PNG, { filename: 'wrong.png', contentType: 'text/plain' })
      .expect(400);
    await request(app())
      .post('/api/upload')
      .set('Authorization', 'Bearer user-a')
      .attach('profilePicture', Buffer.alloc(MAX_UPLOAD_BYTES + 1), { filename: 'large.png', contentType: 'image/png' })
      .expect(400);
  });

  it('accepts valid JPEG content with either standard extension', async () => {
    await request(app())
      .post('/api/upload')
      .set('Authorization', 'Bearer user-a')
      .attach('profilePicture', JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);
    await request(app())
      .post('/api/upload')
      .set('Authorization', 'Bearer user-a')
      .attach('profilePicture', JPEG, { filename: 'photo.jpeg', contentType: 'image/jpeg' })
      .expect(201);
  });

  it('does not expose deleted or missing files and cleans storage when metadata creation fails', async () => {
    const created = await uploadImage().expect(201);
    state.records[0].deletedAt = new Date();
    await request(app()).get(created.body.url).set('Authorization', 'Bearer user-a').expect(404);

    state.records[0].deletedAt = null;
    fs.unlinkSync(path.join(state.privateUploadDir, state.records[0].storageName));
    const missing = await request(app()).get(created.body.url).set('Authorization', 'Bearer user-a').expect(404);
    expect(JSON.stringify(missing.body)).not.toContain(state.privateUploadDir);

    state.records.length = 0;
    mocks.create.mockRejectedValueOnce(new Error('PRIVATE_JOURNAL_SENTINEL metadata failure'));
    const failed = await request(app())
      .post('/api/upload')
      .set('Authorization', 'Bearer user-a')
      .field('notes', 'PRIVATE_USER_METADATA_SENTINEL')
      .attach('file', Buffer.from('PRIVATE_JOURNAL_CONTENT_SENTINEL'), {
        filename: '../../PRIVATE_JOURNAL_SENTINEL.txt',
        contentType: 'text/plain',
      })
      .expect(500);
    expect(JSON.stringify(failed.body)).not.toContain('PRIVATE_JOURNAL_SENTINEL');
    expect(fs.readdirSync(state.privateUploadDir)).toEqual([]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('PRIVATE_JOURNAL_SENTINEL');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('PRIVATE_JOURNAL_CONTENT_SENTINEL');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('PRIVATE_USER_METADATA_SENTINEL');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(state.privateUploadDir);
  });

  it('retires deleted uploads before filesystem cleanup so they are no longer downloadable', async () => {
    const created = await uploadImage().expect(201);
    const storageName = state.records[0].storageName;

    await retireOwnedUpload(created.body.id, 'user-a');

    expect(state.records[0].deletedAt).toEqual(expect.any(Date));
    expect(fs.existsSync(path.join(state.privateUploadDir, storageName))).toBe(false);
    await request(app()).get(created.body.url).set('Authorization', 'Bearer user-a').expect(404);
  });
});
