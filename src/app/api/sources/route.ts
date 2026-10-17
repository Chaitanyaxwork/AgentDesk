import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeWebsite } from '@/lib/scraper';
import { chunkText, embedAndStore, ChunkInput } from '@/lib/embeddings';
import { Source } from '@/lib/types';
import { assertAiAvailable, createAiRequestContext } from '@/lib/ai-policy';
import { validatePublicDestination } from '@/lib/safe-fetch';
import { FREE_PLAN_LIMITS, PRICING, isPlanKey } from '@/lib/pricing';
import { isSameOriginWrite } from '@/lib/request-security';

/**
 * Request-bound website indexing. This avoids losing fire-and-forget work on serverless hosts.
 */
async function processWebsiteSource(
  sourceId: string,
  businessId: string,
  url: string,
  aiContext: ReturnType<typeof createAiRequestContext>
): Promise<void> {
  const supabase = createAdminClient();

  try {
    // 1. Mark as processing
    await supabase
      .from('sources')
      .update({ status: 'processing' })
      .eq('id', sourceId);

    // 2. Crawl website
    const pages = await scrapeWebsite(url);

    // 3. Prepare chunk list
    const allChunks: ChunkInput[] = [];
    let preview = '';

    for (const page of pages) {
      if (!preview && page.content) {
        preview = page.content.slice(0, 300);
      }
      const pageChunks = chunkText(page.content);
      for (const chunkContent of pageChunks) {
        allChunks.push({
          content: chunkContent,
          metadata: {
            url: page.url,
            title: page.title,
            heading: page.heading || page.title,
          },
        });
      }
    }

    // Save content preview
    if (preview) {
      await supabase
        .from('sources')
        .update({ content_preview: preview })
        .eq('id', sourceId);
    }

    // 4. Generate embeddings and persist chunks
    await embedAndStore(businessId, sourceId, allChunks, aiContext);
  } catch (error) {
    console.error('Website source processing failed:', error instanceof Error ? error.name : 'unknown error');
    await supabase
      .from('sources')
      .update({
        status: 'failed',
      error_message: error instanceof Error && /30 chunks|narrow the crawl/i.test(error.message)
        ? error.message.slice(0, 200)
        : 'Could not scrape or index this source. Check the URL and try again.',
      })
      .eq('id', sourceId);
  }
}

/**
 * GET /api/sources
 * Returns all knowledge sources for the authenticated user's business.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: sources, error } = await supabase
    .from('sources')
    .select('*')
    .eq('business_id', authCtx.business.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching sources:', error);
    return NextResponse.json({ error: 'Failed to fetch knowledge sources' }, { status: 500 });
  }

  return NextResponse.json(sources as Source[]);
}

/**
 * POST /api/sources
 * Creates a new knowledge source (website, text, or pdf).
 * Website scraping and embedding are synchronous and bounded to the request.
 * For text sources, chunks and embeds immediately.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginWrite(req)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, url, title, content } = body;

    if (!type || !['website', 'text'].includes(type)) {
      return NextResponse.json(
        { error: 'Valid source type required: "website" or "text".' },
        { status: 400 }
      );
    }

    const businessId = authCtx.business.id;
    const activePlan = isPlanKey(authCtx.business.plan) ? PRICING[authCtx.business.plan] : FREE_PLAN_LIMITS;
    const aiContext = createAiRequestContext(req, businessId);
    assertAiAvailable(aiContext);
    const supabase = createAdminClient();

    const { count: sourceCount, error: countError } = await supabase.from('sources')
      .select('id', { count: 'exact', head: true }).eq('business_id', businessId);
    if (countError) return NextResponse.json({ error: 'Could not check the workspace source limit.' }, { status: 500 });
    if ((sourceCount || 0) >= activePlan.sources) return NextResponse.json({ error: `Your ${activePlan.name} plan allows ${activePlan.sources} knowledge source${activePlan.sources === 1 ? '' : 's'} per workspace.` }, { status: 429 });

    if (type === 'website') {
      if (!url || typeof url !== 'string' || url.length > 2048) return NextResponse.json({ error: 'A valid public website URL is required.' }, { status: 400 });
      const safeUrl = await validatePublicDestination(url);

      const sourceTitle = (typeof title === 'string' && title.trim().slice(0, 120)) || safeUrl.hostname;

      // Create source record in pending state
      const { data: newSource, error: createError } = await supabase
        .from('sources')
        .insert({
          business_id: businessId,
          type: 'website',
          url: safeUrl.toString(),
          title: sourceTitle,
          status: 'pending',
          chunks_count: 0,
        })
        .select('*')
        .single();

      if (createError || !newSource) {
        console.error('Error creating website source record:', createError);
        return NextResponse.json({ error: 'Failed to create source record' }, { status: 500 });
      }

      await processWebsiteSource(newSource.id, businessId, safeUrl.toString(), aiContext);
      const { data: completedSource } = await supabase.from('sources').select('*').eq('id', newSource.id).single();
      return NextResponse.json((completedSource as Source) || newSource, { status: 201 });
    }

    if (type === 'text') {
      if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 30000) {
        return NextResponse.json({ error: 'Content is required for text source.' }, { status: 400 });
      }

      const trimmedContent = content.trim();
      const sourceTitle = (typeof title === 'string' && title.trim().slice(0, 120)) || 'Text Document';
      const preview = trimmedContent.slice(0, 300);

      // Create source record
      const { data: newSource, error: createError } = await supabase
        .from('sources')
        .insert({
          business_id: businessId,
          type: 'text',
          title: sourceTitle,
          content_preview: preview,
          status: 'processing',
          chunks_count: 0,
        })
        .select('*')
        .single();

      if (createError || !newSource) {
        console.error('Error creating text source record:', createError);
        return NextResponse.json({ error: 'Failed to create source record' }, { status: 500 });
      }

      // Chunk and embed synchronously
      const chunks = chunkText(trimmedContent);
      try {
        await embedAndStore(businessId, newSource.id, chunks, aiContext);
      } catch (error) {
        await supabase.from('sources').update({ status: 'failed', error_message: 'Could not index this text source.' }).eq('id', newSource.id);
        throw error;
      }

      const { data: updatedSource } = await supabase
        .from('sources')
        .select('*')
        .eq('id', newSource.id)
        .single();

      return NextResponse.json(
        (updatedSource as Source) || { ...newSource, status: 'completed' },
        { status: 201 }
      );
    }

    return NextResponse.json({ error: 'Unsupported source type' }, { status: 400 });
  } catch (error) {
    console.error('Sources POST failed:', error instanceof Error ? error.name : 'unknown error');
    return NextResponse.json({ error: 'Could not add this source. Check its content and try again.' }, { status: 503 });
  }
}

/**
 * DELETE /api/sources?id=<source_id>
 * Deletes a source and its vector chunks (via cascade).
 */
export async function DELETE(req: NextRequest) {
  if (!isSameOriginWrite(req)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sourceId = searchParams.get('id');

  if (!sourceId) {
    return NextResponse.json({ error: 'Missing source id parameter' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Validate ownership
  const { data: existingSource } = await supabase
    .from('sources')
    .select('id')
    .eq('id', sourceId)
    .eq('business_id', authCtx.business.id)
    .maybeSingle();

  if (!existingSource) {
    return NextResponse.json({ error: 'Source not found or access denied' }, { status: 404 });
  }

  // Delete chunks first (explicit cleanup alongside cascade).
  const { error: chunksError } = await supabase.from('chunks').delete().eq('source_id', sourceId).eq('business_id', authCtx.business.id);
  if (chunksError) {
    console.error('Error deleting source chunks:', chunksError.code || 'database error');
    return NextResponse.json({ error: 'Failed to delete source content' }, { status: 500 });
  }

  // Delete source
  const { error: deleteError } = await supabase
    .from('sources')
    .delete()
    .eq('id', sourceId)
    .eq('business_id', authCtx.business.id);

  if (deleteError) {
    console.error('Error deleting source:', deleteError);
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted_id: sourceId });
}
