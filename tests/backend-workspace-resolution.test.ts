import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkspaceLookup } from '../src/lib/workspace-resolution.ts';

test('a failed owner lookup cannot be mistaken for a missing workspace', () => {
  assert.deepEqual(resolveWorkspaceLookup({
    ownedBusinessFound: false,
    ownedLookupFailed: true,
    memberBusinessId: null,
    membershipLookupFailed: false,
  }), { kind: 'unavailable' });
});

test('a failed or ambiguous team lookup cannot provision an unrelated personal workspace', () => {
  assert.deepEqual(resolveWorkspaceLookup({
    ownedBusinessFound: false,
    ownedLookupFailed: false,
    memberBusinessId: null,
    membershipLookupFailed: true,
  }), { kind: 'unavailable' });
});

test('provisioning is permitted only after successful lookups confirm no workspace membership', () => {
  assert.deepEqual(resolveWorkspaceLookup({
    ownedBusinessFound: false,
    ownedLookupFailed: false,
    memberBusinessId: null,
    membershipLookupFailed: false,
  }), { kind: 'provision' });
  assert.deepEqual(resolveWorkspaceLookup({
    ownedBusinessFound: false,
    ownedLookupFailed: false,
    memberBusinessId: 'business-123',
    membershipLookupFailed: false,
  }), { kind: 'member', businessId: 'business-123' });
});
