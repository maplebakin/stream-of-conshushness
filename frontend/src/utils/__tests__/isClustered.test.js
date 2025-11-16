import test from 'node:test';
import assert from 'node:assert/strict';

import { isClustered } from '../isClustered.js';

test('isClustered returns false when entry has no cluster data', () => {
  assert.equal(isClustered({}), false);
  assert.equal(isClustered(null), false);
});

test('isClustered returns true when legacy cluster string is present', () => {
  assert.equal(isClustered({ cluster: 'focus' }), true);
  assert.equal(isClustered({ cluster: '   focus   ' }), true);
});

test('isClustered returns false for empty or whitespace cluster strings', () => {
  assert.equal(isClustered({ cluster: '' }), false);
  assert.equal(isClustered({ cluster: '   ' }), false);
});

test('isClustered returns true when clusters array has entries', () => {
  assert.equal(isClustered({ clusters: ['abc123'] }), true);
  assert.equal(isClustered({ clusters: [null, 'abc123'] }), true);
});

test('isClustered returns false when clusters array lacks usable values', () => {
  assert.equal(isClustered({ clusters: [] }), false);
  assert.equal(isClustered({ clusters: ['   ', null] }), false);
});
