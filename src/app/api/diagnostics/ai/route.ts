import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getAuthContext } from '@/lib/auth';
import { createAiRequestContext, assertAiAvailable, reserveAiUsage, aiModels } from '@/lib/ai-policy';
import { generateEmbedding, getSystemPrompt } from '@/lib/gemini';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAnswerWithSources } from '@/lib/rag';
import { isSameOriginWrite } from '@/lib/request-security';

// Explicit POST only; requires an authenticated workspace owner and an operator opt-in.
export async function POST(request: NextRequest) {
  if (!isSameOriginWrite(request)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.business.user_id !== auth.user.id) return NextResponse.json({ error: 'Only the workspace owner can run diagnostics.' }, { status: 403 });
  if (process.env.AI_DIAGNOSTICS_ENABLED !== 'true') return NextResponse.json({ error: 'AI diagnostics are disabled by the operator.' }, { status: 503 });
  try {
    const context = createAiRequestContext(request, auth.business.id);
    assertAiAvailable(context);
    const models = aiModels();
    const embedding = await generateEmbedding('AgentDesk AI connectivity diagnostic.', context);
    if (embedding.length !== models.embeddingDimensions) throw new Error('Embedding dimensions do not match database configuration.');
    const { data: sourceChunk, error: chunkError } = await createAdminClient().from('chunks')
      .select('content').eq('business_id', auth.business.id).limit(1).maybeSingle();
    if (chunkError || !sourceChunk?.content) throw new Error('Add and index a knowledge source before running the RAG diagnostic.');
    const rag = await generateAnswerWithSources(auth.business.id, auth.business.name, 'Summarize this indexed business information in one short sentence.', context, []);
    if (!rag.answer.trim() || rag.answer.includes("couldn't find that information")) throw new Error('Indexed knowledge was not retrieved.');
    await reserveAiUsage(context);
    const response = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }).models.generateContent({
      model: models.generation,
      contents: 'Reply with exactly: AgentDesk AI diagnostic passed.',
      config: { systemInstruction: getSystemPrompt('AgentDesk'), maxOutputTokens: 32, temperature: 0 },
    });
    if (!response.text?.trim()) throw new Error('The model returned an empty diagnostic response.');
    return NextResponse.json({ ok: true, generation_model: models.generation, embedding_model: models.embedding, dimensions: embedding.length, generation: 'passed', embedding: 'passed', indexed_rag: 'passed', source_references: rag.sources.length });
  } catch (error) {
    console.error('AI diagnostic failed:', error instanceof Error ? error.name : 'unknown error');
    return NextResponse.json({ error: 'AI connectivity diagnostic failed. Check server configuration and provider access.' }, { status: 503 });
  }
}
