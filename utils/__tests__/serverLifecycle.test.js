import { describe, expect, it, vi } from 'vitest';
import { closeServerAndDatabase } from '../serverLifecycle.js';

describe('server lifecycle', () => {
  it('waits for the HTTP server to drain before disconnecting the database', async () => {
    let finishClose;
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const server = {
      listening: true,
      close: vi.fn((callback) => {
        finishClose = callback;
      }),
    };

    const shutdown = closeServerAndDatabase({ server, disconnect });
    await Promise.resolve();
    expect(server.close).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();

    finishClose();
    await shutdown;
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('still disconnects persistence if HTTP close reports an error', async () => {
    const closeError = new Error('close failed');
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const server = {
      listening: true,
      close: vi.fn((callback) => callback(closeError)),
    };

    await expect(closeServerAndDatabase({ server, disconnect })).rejects.toBe(closeError);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('disconnects without trying to close an inactive HTTP server', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const server = { listening: false, close: vi.fn() };

    await closeServerAndDatabase({ server, disconnect });

    expect(server.close).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
