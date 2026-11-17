import assert from 'node:assert/strict';
import test from 'node:test';
import { allFeatures, featuresOn, liveFeatures } from '../src/config/feature-flags.mjs';

test('features stay as they are live unless VITE_FEATURES asks for more', () => {
  assert.deepEqual([...featuresOn(undefined)], liveFeatures);
  assert.deepEqual([...featuresOn('')], liveFeatures);
  assert.deepEqual([...featuresOn('all')].sort(), [...allFeatures].sort());
  assert.deepEqual(
    [...featuresOn(' comments , stats ')].sort(),
    [...new Set([...liveFeatures, 'comments', 'stats'])].sort(),
  );
});
