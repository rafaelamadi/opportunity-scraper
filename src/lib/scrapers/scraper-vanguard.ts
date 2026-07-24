/**
 * vanguardngr.com scraper
 * Fetches Business category articles via RSS feed (/category/business/feed/),
 * then applies ICT_KEYWORDS filter. RSS feed bypasses Cloudflare protection.
 * General business news, not pre-filtered for ICT, so requires keyword matching.
 */

import { DEFAULT_HEADERS, ICT_KEYWORDS, SOURCES } from "./config";
import {
  buildTenderDict,
  fetchWithRetry,
  insertTendersBulk,
  logScraperRun,
  matchKeywords,
  parseDate,
  stripHtml,
} from "./utils";

const SOURCE = SOURCES.vanguard;

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  content?: string;
}

async function parseRSSFeed(xmlText: string): Promise<RSSItem[]> {
  const items: RSSItem[] = [];

  // Simple regex-based RSS parsing (no external XML library needed)
  // Extract all <item> elements
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];

    // Extract fields with regex (handles CDATA sections)
    const titleMatch = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch = itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const descriptionMatch = itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/);
    const contentMatch = itemXml.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/);

    const title = titleMatch ? stripHtmlCDATA(titleMatch[1]) : "";
    const link = linkMatch ? linkMatch[1].trim() : "";
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
    const description = descriptionMatch ? stripHtmlCDATA(descriptionMatch[1]) : "";
    const content = contentMatch ? stripHtmlCDATA(contentMatch[1]) : "";

    if (title && link) {
      items.push({
        title,
        link,
        pubDate,
        description,
        content,
      });
    }
  }

  return items;
}

// Remove CDATA markers and HTML tags from RSS text
function stripHtmlCDATA(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

async function fetchFeed(): Promise<RSSItem[]> {
  console.log(`Fetching Business RSS feed from ${SOURCE.name}...`);
  const response = await fetchWithRetry(SOURCE.feed_url, {
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xmlText = await response.text();
  console.log(`✓ Fetched RSS feed, parsing items...`);

  const items = await parseRSSFeed(xmlText);
  console.log(`✓ Parsed ${items.length} items from RSS feed`);

  return items;
}

function extractTenders(items: RSSItem[]) {
  const tenders: ReturnType<typeof buildTenderDict>[] = [];

  for (const item of items) {
    try {
      const title = stripHtml(item.title);
      // Use description (excerpt) + content body for keyword matching
      const description = stripHtml(item.description || item.content || "").slice(0, 500);
      const datePublished = parseDate(item.pubDate);
      const link = item.link;

      if (!title || !link) continue;

      // No pre-built ICT category on this site — filter by keyword ourselves
      const matched = matchKeywords(`${title} ${description}`, ICT_KEYWORDS);
      if (matched.length === 0) continue;

      const tender = buildTenderDict({
        title,
        source_name: SOURCE.name,
        source_url: link,
        description,
        date_published: datePublished,
        category: "Business",
        matched_keywords: matched.join(", "),
      });

      tenders.push(tender);
    } catch (_err) {
      // Skip individual items that fail to parse
    }
  }

  return tenders;
}

export async function runVanguardScraper() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Running ${SOURCE.name} scraper...`);
  console.log("=".repeat(80));

  const startTime = Date.now();

  try {
    const items = await fetchFeed();
    if (items.length === 0) {
      console.log(`No items found from ${SOURCE.name}`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No items returned from RSS feed",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    const tenders = extractTenders(items);
    console.log(`Matched ${tenders.length}/${items.length} items against ICT keywords`);

    if (tenders.length === 0) {
      console.log(`No ICT-relevant items found from ${SOURCE.name} in this batch`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: true, // Not a failure — just no matches this run, which is expected/normal
        error_message: null,
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: true };
    }

    const inserted = await insertTendersBulk(tenders);
    console.log(`✓ Inserted ${inserted}/${tenders.length} tenders into Supabase`);

    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: tenders.length,
      inserted_count: inserted,
      success: true,
      error_message: null,
      elapsed_ms: Date.now() - startTime,
    });

    return {
      source: SOURCE.name,
      scraped: tenders.length,
      inserted,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ ${SOURCE.name} scraper failed:`, message);

    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: 0,
      inserted_count: 0,
      success: false,
      error_message: message,
      elapsed_ms: Date.now() - startTime,
    });

    return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
  }
}
