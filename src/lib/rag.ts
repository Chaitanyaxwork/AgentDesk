import { generateEmbedding, generateResponse } from '@/lib/gemini';
import { AiRequestContext } from '@/lib/ai-policy';
import { createAdminClient } from '@/lib/supabase/admin';
import { MatchedChunk, Message } from '@/lib/types';
import { attachCitedSources } from '@/lib/rag-citations';
import { buildRetrievalQuery } from '@/lib/rag-query';

/**
 * Retrieves the most relevant knowledge base chunks for a given query and business.
 *
 * @param businessId ID of the business
 * @param query The user's query string
 * @param topK Maximum number of chunks to retrieve (default: 5)
 * @param threshold Minimum cosine similarity score (default: 0.35)
 * @returns Array of matched chunks with content and similarity scores
 */
export async function retrieveContext(
  businessId: string,
  query: string,
  aiContext: AiRequestContext,
  topK: number = Math.max(1, Math.min(10, Number(process.env.RAG_TOP_K) || 5)),
  threshold: number = Math.max(0, Math.min(1, Number(process.env.RAG_SIMILARITY_THRESHOLD) || 0.45))
): Promise<MatchedChunk[]> {
  const queryEmbedding = await generateEmbedding(query, aiContext);
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_business_id: businessId,
      match_threshold: threshold,
      match_count: topK,
    });

  if (error) throw new Error('Knowledge retrieval is temporarily unavailable.');

  return (data as MatchedChunk[]) || [];
}

/**
 * Executes the complete RAG (Retrieval-Augmented Generation) pipeline:
 * 1. Retrieves relevant context chunks from the knowledge base.
 * 2. Formats context and conversation history.
 * 3. Prompts the Gemini model with system guidelines and grounded context.
 * 4. Returns the synthesized answer.
 *
 * @param businessId Unique business identifier
 * @param businessName Display name of the business
 * @param query Latest user question or statement
 * @param conversationHistory Previous messages in the conversation
 * @returns AI generated support response
 */
export async function generateAnswer(
  businessId: string,
  businessName: string,
  query: string,
  aiContext: AiRequestContext,
  conversationHistory: Message[] = []
): Promise<string> {
  return (await generateAnswerWithSources(businessId, businessName, query, aiContext, conversationHistory)).answer;
}

export async function generateAnswerWithSources(
  businessId: string,
  businessName: string,
  query: string,
  aiContext: AiRequestContext,
  conversationHistory: Message[] = []
): Promise<{ answer: string; sources: Array<{ title: string; url: string }> }> {
  // Retrieve top context chunks
  const matchedChunks = await retrieveContext(businessId, buildRetrievalQuery(query, conversationHistory), aiContext);

  if (matchedChunks.length === 0) {
    return { answer: "I couldn't find that information in the business's knowledge base. Please contact the business directly.", sources: [] };
  }

  // Format context text
  let contextText = '';
  if (matchedChunks.length > 0) {
    contextText = matchedChunks
      .map((chunk, idx) => `[S${idx + 1}] title=${String(chunk.metadata?.title || 'Business source').slice(0, 120)} heading=${String(chunk.metadata?.heading || '').slice(0, 120)}\n${chunk.content}`)
      .join('\n\n');
  }

  // Format recent conversation history (last 6 messages for context continuity)
  let formattedHistory = '';
  if (conversationHistory.length > 0) {
    const recentMessages = conversationHistory.slice(-6);
    formattedHistory = recentMessages
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content.slice(0, 1200)}`)
      .join('\n');
  }

  // Combine query with history if available
  const fullPrompt = formattedHistory
    ? `Recent Conversation:\n${formattedHistory}\n\nLatest User Question: ${query}`
    : query;

  const rawAnswer = await generateResponse(fullPrompt, contextText, businessName, aiContext);
  return attachCitedSources(rawAnswer, matchedChunks);
}
