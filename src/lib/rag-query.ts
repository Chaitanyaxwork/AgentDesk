type HistoryMessage = { role: string; content: string };

const HISTORY_QUERY_BUDGET = 1_200;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_CHARS = 400;

/**
 * Adds a small, recent conversation window to an underspecified follow-up
 * query. Keep the current question first so it is never truncated by the
 * embedding provider's input limit, and cap history to avoid drowning it out.
 */
export function buildRetrievalQuery(query: string, history: HistoryMessage[] = []): string {
  const currentQuestion = query.trim();
  if (!currentQuestion || history.length === 0) return currentQuestion;

  let remaining = HISTORY_QUERY_BUDGET;
  const selected: string[] = [];
  for (const message of history.slice(-MAX_HISTORY_MESSAGES).reverse()) {
    if (remaining <= 0) break;
    const content = message.content.trim();
    if (!content) continue;
    const excerpt = content.slice(0, MAX_HISTORY_MESSAGE_CHARS);
    const entry = `${message.role.toUpperCase()}: ${excerpt}`;
    if (entry.length > remaining) {
      const rolePrefix = `${message.role.toUpperCase()}: `;
      selected.push(`${rolePrefix}${excerpt.slice(0, Math.max(0, remaining - rolePrefix.length))}`);
      remaining = 0;
    } else {
      selected.push(entry);
      remaining -= entry.length + 1;
    }
  }
  if (selected.length === 0) return currentQuestion;
  return `Latest user question: ${currentQuestion}\nRecent conversation: ${selected.reverse().join('\n')}`;
}
