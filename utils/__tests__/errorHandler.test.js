import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSafeErrorLog, globalErrorHandler, logRequestError } from '../errorHandler.js';

const PRIVATE = 'PRIVATE_JOURNAL_SENTINEL';

function requestFixture() {
  return {
    id: 'request-safe-123',
    method: 'POST',
    path: '/api/entries',
    route: { path: '/' },
    user: { userId: 'user-safe-456' },
    headers: {
      authorization: `Bearer ${PRIVATE}`,
      cookie: `session=${PRIVATE}`,
    },
    body: {
      text: PRIVATE,
      content: `<p>${PRIVATE}</p>`,
      html: `<strong>${PRIVATE}</strong>`,
      notes: PRIVATE,
      description: PRIVATE,
      title: PRIVATE,
      password: PRIVATE,
      token: PRIVATE,
      safeFlag: true,
      nested: {
        sourceExcerpt: PRIVATE,
        deeply: { value: PRIVATE },
      },
      artifacts: [{ text: PRIVATE, details: PRIVATE }],
    },
    files: [{ mimetype: 'text/plain', buffer: Buffer.from(PRIVATE) }],
  };
}

function responseFixture() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe('privacy-safe error logging', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('logs allowlisted request metadata without user-authored values', () => {
    const error = new Error(`failed: ${PRIVATE}`);
    error.code = 'E_WRITE_FAILED';
    const req = requestFixture();

    logRequestError('entry save failed', error, req, 500);

    const serialized = JSON.stringify(errorSpy.mock.calls);
    const metadata = errorSpy.mock.calls[0][1];
    expect(serialized).not.toContain(PRIVATE);
    expect(metadata).toMatchObject({
      event: 'entry save failed',
      method: 'POST',
      route: '/',
      path: '/api/entries',
      requestId: 'request-safe-123',
      userId: 'user-safe-456',
      status: 500,
      errorName: 'Error',
      errorCode: 'E_WRITE_FAILED',
      bodyFieldNames: ['safeFlag', 'nested', 'artifacts'],
      bodyFieldCount: 11,
      uploadCount: 1,
      uploadMimeTypes: ['text/plain'],
    });
    expect(metadata.bodyBytes).toBeGreaterThan(0);
    expect(metadata).not.toHaveProperty('body');
    expect(metadata).not.toHaveProperty('query');
    expect(metadata).not.toHaveProperty('headers');
  });

  it('keeps global handler operational without serializing sensitive request data', () => {
    const req = requestFixture();
    const res = responseFixture();
    const error = new Error(`unexpected ${PRIVATE}`);

    globalErrorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(PRIVATE);
  });

  it('does not include nested or array values when building metadata directly', () => {
    const metadata = buildSafeErrorLog({
      event: 'nested payload failed',
      error: {
        name: PRIVATE,
        code: PRIVATE,
        stack: `ValidationError: ${PRIVATE}\n    at ${PRIVATE} (route.js:1:1)\n    at ${PRIVATE} (${PRIVATE}:2:2)`,
      },
      req: requestFixture(),
      status: 422,
    });

    expect(JSON.stringify(metadata)).not.toContain(PRIVATE);
    expect(metadata.stackFrames).toEqual(['route.js:1:1']);
    expect(metadata.errorName).toBe('UnknownError');
    expect(metadata).not.toHaveProperty('errorCode');
  });
});
