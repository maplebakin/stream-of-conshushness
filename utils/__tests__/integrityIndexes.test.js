import { describe, expect, it, vi } from 'vitest';
import { initializeDeclaredIndexes } from '../integrityIndexes.js';

describe('production index initialization', () => {
  it('waits for every registered model index', async () => {
    const first = { init: vi.fn().mockResolvedValue(undefined) };
    const second = { init: vi.fn().mockResolvedValue(undefined) };
    const mongoose = {
      modelNames: () => ['Entry', 'Task'],
      model: (name) => ({ Entry: first, Task: second })[name],
    };

    await expect(initializeDeclaredIndexes(mongoose)).resolves.toEqual(['Entry', 'Task']);
    expect(first.init).toHaveBeenCalledOnce();
    expect(second.init).toHaveBeenCalledOnce();
  });

  it('fails closed when a required unique index cannot be created', async () => {
    const mongoose = {
      modelNames: () => ['Entry'],
      model: () => ({ init: vi.fn().mockRejectedValue(new Error('duplicate key')) }),
    };

    await expect(initializeDeclaredIndexes(mongoose)).rejects.toThrow('duplicate key');
  });
});
