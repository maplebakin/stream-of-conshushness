import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  sendMail: vi.fn(),
  bcryptHash: vi.fn(),
  bcryptCompare: vi.fn(),
  newUserSave: vi.fn(),
  constructedUsers: [],
}));

vi.mock('../../models/User.js', () => {
  function MockUser(values = {}) {
    Object.assign(this, { _id: 'new-user-id', authVersion: 0 }, values);
    this.save = () => mocks.newUserSave(this);
    mocks.constructedUsers.push(this);
  }
  MockUser.findById = (...args) => mocks.findById(...args);
  MockUser.findOne = (...args) => mocks.findOne(...args);
  MockUser.findOneAndUpdate = (...args) => mocks.findOneAndUpdate(...args);
  return { default: MockUser };
});

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'requester-id', authVersion: 0 };
    next();
  },
}));

vi.mock('../../middleware/rateLimiter.js', () => ({
  authLimiter: (_req, _res, next) => next(),
  passwordResetLimiter: (_req, _res, next) => next(),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: (...args) => mocks.bcryptHash(...args),
    compare: (...args) => mocks.bcryptCompare(...args),
  },
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: (...args) => mocks.sendMail(...args) }),
  },
}));

const TEST_JWT_SECRET = 'auth_security_test_secret_at_least_32_chars';
const originalEnv = {
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV,
  EXPOSE_AUTH_TEST_CREDENTIALS: process.env.EXPOSE_AUTH_TEST_CREDENTIALS,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
};

process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.NODE_ENV = 'development';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
delete process.env.EXPOSE_AUTH_TEST_CREDENTIALS;

const { default: authRouter } = await import('../auth.js');

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  return app;
}

function userDocument(overrides = {}) {
  return {
    _id: 'target-id',
    username: 'alice',
    email: '',
    authVersion: 0,
    resetTokenHash: null,
    resetTokenExpiry: null,
    resetCodeHash: null,
    resetCodeExpiry: null,
    pendingEmail: '',
    emailVerifyCodeHash: null,
    emailVerifyCodeExpiry: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('authentication credential and session hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    delete process.env.EXPOSE_AUTH_TEST_CREDENTIALS;
    mocks.bcryptHash.mockImplementation(async (value) => `hash:${value}`);
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.sendMail.mockResolvedValue(undefined);
    mocks.newUserSave.mockResolvedValue(undefined);
    mocks.constructedUsers.length = 0;
  });

  afterAll(() => {
    Object.entries(originalEnv).forEach(([name, value]) => restoreEnv(name, value));
  });

  it('does not disclose reset credentials merely because the server is in development', async () => {
    const user = userDocument();
    mocks.findOne.mockResolvedValue(user);
    const randomInt = vi.spyOn(crypto, 'randomInt').mockReturnValue(42);

    const response = await request(makeApp())
      .post('/api/forgot')
      .send({ identifier: 'alice' })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(user.resetCodeHash).toBe('hash:000042');
    expect(randomInt).toHaveBeenCalledWith(0, 1_000_000);
    randomInt.mockRestore();
  });

  it('discloses reset credentials only with the explicit non-production opt-in', async () => {
    process.env.EXPOSE_AUTH_TEST_CREDENTIALS = 'true';
    const user = userDocument();
    mocks.findOne.mockResolvedValue(user);
    const randomInt = vi.spyOn(crypto, 'randomInt').mockReturnValue(7);

    const response = await request(makeApp())
      .post('/api/forgot')
      .send({ identifier: 'alice' })
      .expect(200);

    expect(response.body.dev).toMatchObject({ username: 'alice', resetCode: '000007' });
    expect(response.body.dev.resetLink).toContain('/reset?token=');
    randomInt.mockRestore();
  });

  it('never discloses reset credentials in production even when the opt-in is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPOSE_AUTH_TEST_CREDENTIALS = 'true';
    mocks.findOne.mockResolvedValue(userDocument());

    const response = await request(makeApp())
      .post('/api/forgot')
      .send({ identifier: 'alice' })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  it('uses the same explicit opt-in boundary for email verification codes', async () => {
    const user = userDocument();
    mocks.findById.mockResolvedValue(user);
    mocks.findOne.mockResolvedValue(null);

    const hidden = await request(makeApp())
      .post('/api/email/start-verify')
      .send({ email: 'alice@example.com' })
      .expect(200);
    expect(hidden.body).toEqual({ ok: true });

    process.env.EXPOSE_AUTH_TEST_CREDENTIALS = 'true';
    const visible = await request(makeApp())
      .post('/api/email/start-verify')
      .send({ email: 'alice@example.com' })
      .expect(200);
    expect(visible.body.dev).toMatchObject({ email: 'alice@example.com' });
    expect(visible.body.dev.code).toMatch(/^\d{6}$/);
  });

  it('normalizes email identity on registration and includes the normalized lookup key', async () => {
    mocks.findOne.mockResolvedValue(null);

    const response = await request(makeApp())
      .post('/api/register')
      .send({ username: 'alice', email: ' Alice@Example.COM ', password: 'password' })
      .expect(200);

    expect(mocks.constructedUsers).toHaveLength(1);
    expect(mocks.constructedUsers[0]).toMatchObject({
      email: 'alice@example.com',
      emailNormalized: 'alice@example.com',
    });
    expect(response.body.user.email).toBe('alice@example.com');
  });

  it('rejects a malformed optional registration email instead of storing it as identity data', async () => {
    const response = await request(makeApp())
      .post('/api/register')
      .send({ username: 'alice', email: 'not-an-email', password: 'password' })
      .expect(400);

    expect(response.body).toEqual({ error: 'valid email required' });
    expect(mocks.constructedUsers).toHaveLength(0);
  });

  it('translates a concurrent normalized-email registration collision to 409', async () => {
    mocks.findOne.mockResolvedValue(null);
    mocks.newUserSave.mockRejectedValueOnce({
      code: 11000,
      keyPattern: { emailNormalized: 1 },
    });

    const response = await request(makeApp())
      .post('/api/register')
      .send({ username: 'alice', email: 'ALICE@example.com', password: 'password' })
      .expect(409);

    expect(response.body).toEqual({ error: 'email already in use' });
  });

  it('looks up mixed-case email logins by their canonical identity key', async () => {
    mocks.findOne.mockResolvedValue(userDocument({ email: 'alice@example.com', passwordHash: 'hash' }));

    await request(makeApp())
      .post('/api/login')
      .send({ identifier: ' Alice@Example.COM ', password: 'password' })
      .expect(200);

    const query = mocks.findOne.mock.calls[0][0];
    expect(query.$or[0]).toEqual({ emailNormalized: 'alice@example.com' });
    expect(query.$or[1].email.$regex.test('ALICE@example.com')).toBe(true);
  });

  it('rechecks normalized email ownership during direct verification', async () => {
    const user = userDocument({
      pendingEmail: 'Alice@Example.COM',
      emailVerifyCodeHash: 'hash:123456',
      emailVerifyCodeExpiry: new Date(Date.now() + 60_000),
    });
    mocks.findById.mockResolvedValue(user);
    mocks.findOne.mockResolvedValue({ _id: 'other-user' });

    const response = await request(makeApp())
      .post('/api/email/verify')
      .send({ code: '123456' })
      .expect(409);

    expect(response.body).toEqual({ error: 'email already in use' });
    expect(mocks.findOne.mock.calls[0][0].$or[0]).toEqual({
      emailNormalized: 'alice@example.com',
    });
    expect(user.save).not.toHaveBeenCalled();
  });

  it('normalizes a verified email and maps a unique-index race to 409', async () => {
    const user = userDocument({
      pendingEmail: 'Alice@Example.COM',
      emailVerifyCodeHash: 'hash:123456',
      emailVerifyCodeExpiry: new Date(Date.now() + 60_000),
    });
    user.save.mockRejectedValueOnce({ code: 11000, keyPattern: { emailNormalized: 1 } });
    mocks.findById.mockResolvedValue(user);
    mocks.findOne.mockResolvedValue(null);

    const response = await request(makeApp())
      .post('/api/email/verify')
      .send({ code: '123456' })
      .expect(409);

    expect(response.body).toEqual({ error: 'email already in use' });
    expect(user).toMatchObject({
      email: 'alice@example.com',
      emailNormalized: 'alice@example.com',
    });
  });

  it('increments a legacy user to auth version 1 and signs the replacement reset token with it', async () => {
    const user = userDocument({ authVersion: 1 });
    mocks.findOneAndUpdate.mockResolvedValue(user);

    const response = await request(makeApp())
      .post('/api/reset')
      .send({ token: 'one-time-reset-token', newPassword: 'new-password' })
      .expect(200);

    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ resetTokenHash: expect.any(String) }),
      expect.objectContaining({
        $set: expect.objectContaining({ passwordHash: 'hash:new-password', resetTokenHash: null }),
        $inc: { authVersion: 1 },
      }),
      { new: true, runValidators: true }
    );
    expect(jwt.verify(response.body.token, TEST_JWT_SECRET)).toMatchObject({
      userId: 'target-id',
      authVersion: 1,
    });
  });

  it('atomically consumes a reset token so concurrent requests cannot both succeed', async () => {
    const claimedUser = userDocument({ authVersion: 5 });
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(claimedUser)
      .mockResolvedValueOnce(null);

    const [first, second] = await Promise.all([
      request(makeApp()).post('/api/reset').send({ token: 'same-token', newPassword: 'new-password' }),
      request(makeApp()).post('/api/reset').send({ token: 'same-token', newPassword: 'other-password' }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 400]);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('increments auth version and returns a replacement token after an authenticated password change', async () => {
    const user = userDocument({ authVersion: 3 });
    mocks.findById.mockResolvedValue(user);

    const response = await request(makeApp())
      .post('/api/change-password')
      .send({ oldPassword: 'old-password', newPassword: 'new-password' })
      .expect(200);

    expect(user.authVersion).toBe(4);
    expect(jwt.verify(response.body.token, TEST_JWT_SECRET)).toMatchObject({
      userId: 'target-id',
      authVersion: 4,
    });
  });

  it('increments the target auth version during the auth-router admin reset', async () => {
    const requester = { _id: 'requester-id', username: 'admin', isAdmin: true };
    const target = userDocument({ authVersion: 8 });
    mocks.findById.mockReturnValue({
      select: vi.fn().mockResolvedValue(requester),
    });
    mocks.findOne.mockResolvedValue(target);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await request(makeApp())
      .post('/api/admin/reset-password')
      .send({ username: 'alice', newPassword: 'new-password' })
      .expect(200);

    expect(target.authVersion).toBe(9);
    expect(target.save).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
