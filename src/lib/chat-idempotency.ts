/** A stable client message id may be retried only with the exact same text. */
export function isSameClientMessage(existingContent: unknown, retryContent: string): boolean {
  return typeof existingContent === 'string' && existingContent === retryContent.trim();
}
