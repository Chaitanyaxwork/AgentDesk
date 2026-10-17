import * as cheerio from 'cheerio';
import { ScrapedPage } from '@/lib/types';
import { safeFetchHtml, validatePublicDestination, validatePublicHttpUrl } from '@/lib/safe-fetch';

const configuredPageLimit = Number(process.env.MAX_SOURCE_PAGES || 5);
const MAX_PAGES = Number.isInteger(configuredPageLimit) ? Math.max(1, Math.min(5, configuredPageLimit)) : 5;

// File extensions to exclude from crawling
const IGNORED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.wav',
  '.css', '.js', '.json', '.xml', '.rss',
];

/**
 * Checks if a URL points to a non-HTML asset.
 */
function isIgnoredAsset(urlPath: string): boolean {
  const lower = urlPath.toLowerCase();
  return IGNORED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Normalizes a URL by removing hash, trailing slashes, and redundant query params.
 */
function normalizeUrl(targetUrl: string): string | null {
  try {
    const parsed = new URL(targetUrl);
    // Ignore non-http/https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_.+|gclid|fbclid|ref|source)$/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    // Normalize path trailing slash (except root)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Cleans Cheerio HTML DOM tree by stripping non-content tags and navigation boilerplate.
 */
function cleanCheerioDocument($: cheerio.CheerioAPI): void {
  // Remove scripts, stylesheets, comments, headers, footers, and sidebars
  $(
    'script, style, noscript, iframe, svg, canvas, nav, footer, header, ' +
    'aside, form, button, input, select, textarea, [aria-hidden="true"], ' +
    '.nav, .navbar, .menu, .footer, .sidebar, .ad, .advertisement, .cookie-banner'
  ).remove();
}

/**
 * Scrapes a single web page.
 */
async function scrapeSinglePage(pageUrl: string): Promise<{
  page: ScrapedPage | null;
  links: string[];
}> {
  try {
    const res = await safeFetchHtml(pageUrl);

    if (res.status < 200 || res.status >= 300) {
      return { page: null, links: [] };
    }

    if (!res.contentType.includes('text/html') && !res.contentType.includes('application/xhtml+xml')) {
      return { page: null, links: [] };
    }

    const html = res.body;
    const $ = cheerio.load(html);

    // Extract title
    const title =
      $('title').text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      res.url.toString();

    // Extract meta description
    const metaDescription =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    // Find internal links before stripping the document
    const links: string[] = [];
    const currentBase = res.url;

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const resolved = new URL(href, currentBase);
        // Only crawl same domain
        if (resolved.hostname === currentBase.hostname) {
          const norm = normalizeUrl(resolved.toString());
          if (norm && !isIgnoredAsset(resolved.pathname)) {
            links.push(norm);
          }
        }
      } catch {
        // Ignore invalid URLs
      }
    });

    // Clean DOM for content extraction
    cleanCheerioDocument($);

    // Preserve headings and paragraph boundaries while deduplicating repeated
    // boilerplate inside the selected content region.
    const candidateRoot = $('main, article, #content, .content, [role="main"]').first();
    const root = candidateRoot.length ? candidateRoot : $('body');
    const blocks: string[] = [];
    const seenBlocks = new Set<string>();
    let currentHeading = '';
    root.find('h1, h2, h3, h4, p, li, dt, dd, blockquote').each((_, el) => {
      const tag = (el as { tagName?: string }).tagName?.toLowerCase() || '';
      const text = $(el).text().replace(/[\t\r\n\u00a0]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const key = text.toLocaleLowerCase();
      if (seenBlocks.has(key)) return;
      seenBlocks.add(key);
      if (/^h[1-4]$/.test(tag)) {
        currentHeading = text.slice(0, 200);
        blocks.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
      } else blocks.push(`${currentHeading ? `[Heading: ${currentHeading}] ` : ''}${text}`);
    });
    const cleanedContent = blocks.join('\n\n').trim();
    const heading = root.find('h1, h2').first().text().trim().slice(0, 200) || title.slice(0, 200);

    if (!cleanedContent) {
      return { page: null, links };
    }

    const fullContent = metaDescription
      ? `Description: ${metaDescription}\n\n${cleanedContent}`
      : cleanedContent;

    return {
      page: {
        url: res.url.toString(),
        title: title.slice(0, 200),
        heading,
        content: fullContent,
      },
      links,
    };
  } catch (error) {
    console.error(`Error scraping page ${pageUrl}:`, error instanceof Error ? error.message : error);
    return { page: null, links: [] };
  }
}

/**
 * Scrapes a website starting from `startUrl`, crawling internal links up to 20 pages max.
 *
 * @param startUrl Starting website URL
 * @returns Array of scraped pages with title and extracted text
 */
export async function scrapeWebsite(startUrl: string): Promise<ScrapedPage[]> {
  let normalizedStart: string | null = null;
  try {
    normalizedStart = validatePublicHttpUrl(startUrl).toString();
  } catch {
    normalizedStart = null;
  }
  if (!normalizedStart) {
    throw new Error(`Invalid or unsupported URL: ${startUrl}`);
  }

  const results: ScrapedPage[] = [];
  const visited = new Set<string>();
  const contentHashes = new Set<string>();
  const queue: string[] = [];
  const base = new URL(normalizedStart);
  for (const sitemapPath of ['/sitemap.xml', '/sitemap_index.xml']) {
    try {
      const response = await safeFetchHtml(new URL(sitemapPath, base).toString());
      if (response.status < 200 || response.status >= 300 || !/xml/i.test(response.contentType)) continue;
      const xml = cheerio.load(response.body, { xmlMode: true });
      const locs = xml('loc').toArray().map((node) => xml(node).text().trim()).filter(Boolean);
      for (const loc of locs) {
        if (queue.length >= MAX_PAGES) break;
        const normalized = normalizeUrl(loc);
        if (!normalized || new URL(normalized).hostname !== base.hostname || isIgnoredAsset(new URL(normalized).pathname)) continue;
        try { await validatePublicDestination(normalized); queue.push(normalized); } catch { /* Reject unsafe or private sitemap entries. */ }
      }
      if (queue.length) break;
    } catch { /* Sitemaps are optional; crawl internal links when absent. */ }
  }
  if (!queue.includes(normalizedStart)) queue.unshift(normalizedStart);

  while (queue.length > 0 && results.length < MAX_PAGES) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) {
      continue;
    }
    visited.add(currentUrl);

    try {
      const { page, links } = await scrapeSinglePage(currentUrl);
      if (page && page.content.length > 50) {
        const normalizedContent = page.content.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
        if (!contentHashes.has(normalizedContent)) { contentHashes.add(normalizedContent); results.push(page); }
      }

      // Enqueue newly discovered internal links
      for (const link of links) {
        if (!visited.has(link) && !queue.includes(link) && (queue.length + results.length) < MAX_PAGES * 2) {
          queue.push(link);
        }
      }
    } catch (err) {
      console.warn(`Error processing ${currentUrl}:`, err);
    }
  }

  if (results.length === 0) {
    throw new Error(`Could not extract readable text content from ${startUrl}`);
  }

  return results;
}
