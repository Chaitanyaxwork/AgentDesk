import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeWebsite } from '@/lib/scraper';
import { chunkText, embedAndStore, ChunkInput } from '@/lib/embeddings';
import { assertAiAvailable, createAiRequestContext } from '@/lib/ai-policy';
import { validatePublicDestination } from '@/lib/safe-fetch';
import { isSameOriginWrite } from '@/lib/request-security';

/**
 * Background worker for rescraping and refreshing source embeddings.
 */
async function rescrapeSource(
  sourceId: string,
  businessId: string,
  url: string,
  aiContext: ReturnType<typeof createAiRequestContext>
): Promise<void> {
  const supabase = createAdminClient();

  try {
    // 1. Mark status as processing
    await supabase
      .from('sources')
      .update({ status: 'processing', error_message: null })
      .eq('id', sourceId);

    // 2. Scrape target website
    const pages = await scrapeWebsite(url);

    // 3. Build replacement content before removing existing chunks.
    const allChunks: ChunkInput[] = [];
    let preview = '';

    for (const page of pages) {
      if (!preview && page.content) {
        preview = page.content.slice(0, 300);
      }
      const pageChunks = chunkText(page.content);
      for (const chunk of pageChunks) {
        allChunks.push({
          content: chunk,
          metadata: {
            url: page.url,
            title: page.title,
            heading: page.heading || page.title,
          },
        });
      }
    }

    if (preview) {
      await supabase
        .from('sources')
        .update({ content_preview: preview })
        .eq('id', sourceId);
    }

    // 5. Generate embeddings and store
    await embedAndStore(businessId, sourceId, allChunks, aiContext, true);
  } catch (error) {
    console.error('Website source refresh failed:', error instanceof Error ? error.name : 'unknown error');
    await supabase
      .from('sources')
      .update({
        status: 'failed',
        error_message: error instanceof Error && /30 chunks|narrow the crawl/i.test(error.message)
          ? error.message.slice(0, 200)
          : 'Could not refresh this website. Check the URL and try again.',
      })
      .eq('id', sourceId);
  }
}

/**
 * POST /api/sources/[id]/rescrape
 * Triggers re-scraping and re-embedding of a website source.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginWrite(req)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const sourceId = resolvedParams.id;
  if (!sourceId) {
    return NextResponse.json({ error: 'Missing source ID' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Validate source exists and belongs to current business
  const { data: source, error } = await supabase
    .from('sources')
    .select('*')
    .eq('id', sourceId)
    .eq('business_id', authCtx.business.id)
    .maybeSingle();

  if (error || !source) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  if (source.type !== 'website' || !source.url) {
    return NextResponse.json(
      { error: 'Only website sources with a valid URL can be rescraped.' },
      { status: 400 }
    );
  }

  const aiContext = createAiRequestContext(req, authCtx.business.id);
  try {
    assertAiAvailable(aiContext);
    await validatePublicDestination(source.url);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'AI and source processing are unavailable.' }, { status: 503 });
  }

  await supabase.from('sources').update({ status: 'processing', error_message: null }).eq('id', sourceId).eq('business_id', authCtx.business.id);
  await rescrapeSource(source.id, authCtx.business.id, source.url, aiContext);
  const { data: updated } = await supabase.from('sources').select('*').eq('id', sourceId).eq('business_id', authCtx.business.id).single();
  return NextResponse.json(updated || { source_id: sourceId, status: 'failed' });
}
