import { describe, expect, it } from 'vitest';
import { requestErrorSummary } from '../requestError.js';

describe('requestErrorSummary', () => {
  it('reports safe transport metadata without serializing private request data', () => {
    const error = {
      code: 'ERR_BAD_RESPONSE',
      response: { status: 503, data: { error: 'private server detail' } },
      config: { data: JSON.stringify({ text: 'private journal text' }) },
    };

    const summary = requestErrorSummary(error);

    expect(summary).toBe('Request failed (HTTP 503, ERR_BAD_RESPONSE)');
    expect(summary).not.toContain('private');
  });

  it('does not reflect arbitrary error codes or messages', () => {
    expect(requestErrorSummary({
      code: 'bad code containing private text',
      message: 'Request failed for private query',
    })).toBe('Request failed');
  });
});
