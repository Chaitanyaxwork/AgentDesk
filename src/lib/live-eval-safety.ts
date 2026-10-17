export type EvalWorkspaceOwner = {
  id: string;
  user_id: string | null;
};

export function assertSeparateEvalWorkspaceOwners(
  primary: EvalWorkspaceOwner | null | undefined,
  secondary: EvalWorkspaceOwner | null | undefined
): void {
  if (!primary?.user_id || !secondary?.user_id) {
    throw new Error('Both staging workspaces must have real owner accounts.');
  }
  if (primary.user_id === secondary.user_id) {
    throw new Error('The staging workspaces must belong to two separate synthetic test users.');
  }
}
