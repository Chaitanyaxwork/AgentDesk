import { randomUUID } from 'node:crypto';
import { generateEmbedding } from '@/lib/gemini';
import { createAdminClient } from '@/lib/supabase/admin';
import { AiRequestContext } from '@/lib/ai-policy';
export { chunkText } from '@/lib/chunking';

export interface ChunkInput {
  content: string;
  metadata?: Record<string, unknown>;
}

export async function embedAndStore(
  businessId: string,
  sourceId: string,
  chunks: Array<string | ChunkInput>,
  aiContext: AiRequestContext,
  replaceExisting = false
): Promise<number> {
  const normalized = chunks.map((item) => typeof item === 'string' ? { content: item, metadata: {} } : item);
  if (normalized.length === 0) {
    throw new Error('No readable content was found to index.');
  }
  if (normalized.length > 30) {
    throw new Error('This source exceeds the 30 chunk indexing limit. Narrow the crawl to fewer pages or shorten the submitted content, then retry.');
  }

  const runId = randomUUID();
  const supabase = createAdminClient();
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < normalized.length; index += 5) {
    const batch = normalized.slice(index, index + 5);
    const embeddings = await Promise.all(batch.map((item) => generateEmbedding(item.content, aiContext)));
    embeddings.forEach((embedding, batchIndex) => {
      rows.push({
        business_id: businessId,
        source_id: sourceId,
        content: normalized[index + batchIndex].content,
        embedding,
        metadata: {
          ...(normalized[index + batchIndex].metadata || {}),
          chunk_index: index + batchIndex,
          ingest_run_id: runId,
        },
      });
    });
  }

  const { error: insertError } = await supabase.from('chunks').insert(rows);
  if (insertError) throw new Error('Could not save indexed source content.');

  const { data: committed, error: commitError } = await supabase.rpc('commit_source_ingestion', {
    p_source_id: sourceId,
    p_business_id: businessId,
    p_ingest_run_id: runId,
    p_expected_chunks: rows.length,
  });
  if (commitError || committed !== true) {
    // Staged replacement rows are discarded; the prior completed index remains.
    await supabase.from('chunks').delete().eq('source_id', sourceId).eq('business_id', businessId).contains('metadata', { ingest_run_id: runId });
    console.error('Source index commit failed:', commitError?.code || 'database rejected staged index', replaceExisting ? '(old index preserved)' : '');
    throw new Error('Could not commit indexed source content. The previous index, if any, was preserved.');
  }
  return rows.length;
}
