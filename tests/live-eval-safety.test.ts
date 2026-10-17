import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSeparateEvalWorkspaceOwners } from '../src/lib/live-eval-safety.ts';

test('live evaluator requires both staging businesses to have distinct real owners', () => {
  assert.doesNotThrow(() => assertSeparateEvalWorkspaceOwners(
    { id: 'business-a', user_id: 'owner-a' },
    { id: 'business-b', user_id: 'owner-b' }
  ));
  assert.throws(() => assertSeparateEvalWorkspaceOwners(
    { id: 'business-a', user_id: null },
    { id: 'business-b', user_id: 'owner-b' }
  ), /real owner accounts/);
  assert.throws(() => assertSeparateEvalWorkspaceOwners(
    { id: 'business-a', user_id: 'owner-a' },
    { id: 'business-b', user_id: 'owner-a' }
  ), /two separate synthetic test users/);
});
