import { describe, expect, it } from 'vitest';
import User from '../../models/User.js';

describe('User authentication schema', () => {
  it('keeps legacy session versions compatible and normalizes new email values', async () => {
    const user = new User({
      username: 'alice',
      passwordHash: 'hash',
      email: ' Alice@Example.COM ',
      pendingEmail: ' Next@Example.COM ',
    });

    await user.validate();

    expect(user.authVersion).toBe(0);
    expect(user.email).toBe('alice@example.com');
    expect(user.pendingEmail).toBe('next@example.com');
    expect(user.emailNormalized).toBe('alice@example.com');
  });

  it('defines a partial unique index for populated normalized email identities', () => {
    const index = User.schema.indexes().find((entry) => entry[1]?.name === 'user_email_normalized_unique');

    expect(index).toEqual([
      { emailNormalized: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { emailNormalized: { $type: 'string' } },
      }),
    ]);
  });
});
