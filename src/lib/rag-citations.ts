import type { MatchedChunk } from '@/lib/types';

export const NO_GROUNDED_ANSWER = "I couldn't verify an answer from the business's available sources. Please contact the business directly.";

type PublicSource = { title: string; url: string };

/** Citation checks are conservative guardrails, not a semantic grounding proof. */
export function attachCitedSources(rawAnswer: string, matchedChunks: MatchedChunk[]): { answer: string; sources: PublicSource[] } {
  const citedIndexes = new Set(Array.from(rawAnswer.matchAll(/\[S([1-9]\d*)\]/g), (match) => Number(match[1]) - 1));
  const answer = rawAnswer.replace(/\s*\[S\d+\]/g, '').trim();
  const sourceMap = new Map<string, PublicSource>();
  const answerTerms = new Set(answer.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 3));
  for (const index of citedIndexes) {
    const chunk = matchedChunks[index];
    if (!chunk) continue;
    const sourceTerms = new Set(chunk.content.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 3));
    const overlap = [...answerTerms].filter((term) => sourceTerms.has(term)).length;
    if (answerTerms.size > 0 && overlap / answerTerms.size < 0.15) continue;
    const url = typeof chunk.metadata?.url === 'string' ? chunk.metadata.url : '';
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) continue;
      sourceMap.set(parsed.toString(), {
        title: typeof chunk.metadata?.title === 'string' ? chunk.metadata.title.slice(0, 120) : parsed.hostname,
        url: parsed.toString(),
      });
    } catch { /* Ignore malformed metadata rather than returning an unsafe citation. */ }
  }
  if (!answer || sourceMap.size === 0) return { answer: NO_GROUNDED_ANSWER, sources: [] };
  return { answer, sources: [...sourceMap.values()].slice(0, 3) };
}
