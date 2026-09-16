import { describe, expect, it } from 'vitest';
import Note from '../../models/Note.js';
import Task from '../../models/Task.js';

function uniqueIndexFor(model, fields) {
  return model.schema.indexes().find(([keys, options]) => (
    options?.unique === true
    && Object.entries(fields).every(([key, value]) => keys[key] === value)
  ));
}

describe('manual write idempotency indexes', () => {
  it('enforces one unclustered daily note identity per owner', () => {
    const index = uniqueIndexFor(Note, { userId: 1, dailyKey: 1 });
    expect(index?.[1]?.partialFilterExpression).toEqual({ dailyKey: { $type: 'string' } });
  });

  it('enforces one manual task per owner and client request', () => {
    const index = uniqueIndexFor(Task, { userId: 1, clientRequestId: 1 });
    expect(index?.[1]?.partialFilterExpression).toEqual({ clientRequestId: { $type: 'string' } });
  });
});
