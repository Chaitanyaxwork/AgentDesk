export type WorkspaceLookupResult =
  | { kind: 'owned' }
  | { kind: 'member'; businessId: string }
  | { kind: 'provision' }
  | { kind: 'unavailable' };

/**
 * Only create a personal workspace after both successful lookups confirm that
 * the authenticated user neither owns nor belongs to an existing workspace.
 * In particular, a failed or ambiguous team lookup must never be treated as
 * proof that the user has no workspace.
 */
export function resolveWorkspaceLookup(input: {
  ownedBusinessFound: boolean;
  ownedLookupFailed: boolean;
  memberBusinessId: string | null;
  membershipLookupFailed: boolean;
}): WorkspaceLookupResult {
  if (input.ownedLookupFailed || input.membershipLookupFailed) return { kind: 'unavailable' };
  if (input.ownedBusinessFound) return { kind: 'owned' };
  if (input.memberBusinessId) return { kind: 'member', businessId: input.memberBusinessId };
  return { kind: 'provision' };
}
