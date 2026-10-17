export function canRequestHumanFollowUp(status: unknown): boolean {
  return status === 'active' || status === 'escalated';
}
