/**
 * Generic RSS Feed scraper
 * Fetches articles from multiple RSS feeds, filters by keywords, inserts to Supabase
 * Supports any RSS feed (tech news, business news, etc.)
 */

import { DEFAULT_HEADERS, ICT_KEYWORDS } from "./config";
import {
  buildTenderDict,
  fetchWithRetry,
  insertTendersBulk,
  logScraperRun,
  matchKeywords,
  parseDate,
  stripHtml,
} from "./utils";

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  content?: string;
}

interface RSSFeedConfig {
  name: string;
  url: string;
  keywords: readonly string[];
  // When true, capture ALL items regardless of keywords. Use for sources that are
  // already opportunity-focused (e.g. grant feeds) where keyword filtering just
  // discards relevant results. `opportunity_type` tags what the feed produces.
  skipKeywordFilter?: boolean;
  opportunity_type?: string;
}

// RSS feed configurations
const RSS_FEEDS: RSSFeedConfig[] = [
  {
    name: "techcabal",
    url: "https://techcabal.com/feed/",
    keywords: [
      "developer",
      "software",
      "platform",
      "startup",
      "funding",
      "hiring",
      "launch",
      "app",
      "digital",
      "ict",
    ],
  },
  {
    name: "businessday",
    url: "https://businessday.ng/feed/",
    keywords: ["digital", "ict", "technology", "software", "platform", "automation", "system"],
  },
  {
    name: "thecable",
    url: "https://www.thecable.ng/feed/",
    keywords: [
      "e-government",
      "digital",
      "ict",
      "government",
      "technology",
      "platform",
      "modernization",
    ],
  },
  {
    name: "pulse_tech",
    url: "https://pulse.ng/tech/feed/",
    keywords: ["software", "platform", "app", "developer", "tech", "digital", "launch"],
  },
  {
    name: "nairametrics",
    url: "https://nairametrics.com/feed/",
    keywords: ["startup", "platform", "software", "fintech", "digital", "technology", "app"],
  },
  {
    name: "fundsforngos",
    url: "https://www2.fundsforngos.org/feed/",
    // Grant feed - already opportunity-focused, so capture everything rather than
    // discarding grants that don't happen to mention an ICT keyword.
    keywords: [],
    skipKeywordFilter: true,
    opportunity_type: "grant",
  },
  {
    name: "devex",
    url: "https://www.devex.com/feed.xml",
    keywords: [
      "tender",
      "rfp",
      "rfq",
      "software",
      "digital",
      "ict",
      "technology",
      "platform",
      "e-government",
      "africa",
    ],
  },
  {
    name: "ukri",
    url: "https://www.ukri.org/opportunity/feed",
    // Grant/funding-call feed - already opportunity-focused, so capture everything
    // rather than discarding calls that don't happen to mention an ICT keyword.
    keywords: [],
    skipKeywordFilter: true,
    opportunity_type: "grant",
  },
];

function stripHtmlCDATA(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

async function parseRSSFeed(xmlText: string): Promise<RSSItem[]> {
  const items: RSSItem[] = [];

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

async function fetchFeed(config: RSSFeedConfig): Promise<RSSItem[]> {
  console.log(`Fetching RSS feed: ${config.name} (${config.url})...`);
  try {
    const response = await fetchWithRetry(config.url, {
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xmlText = await response.text();
    const items = await parseRSSFeed(xmlText);
    console.log(`✓ Parsed ${items.length} items from ${config.name}`);

    return items;
  } catch (err) {
    console.error(`✗ Failed to fetch ${config.name}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

function extractTenders(items: RSSItem[], config: RSSFeedConfig) {
  const tenders: ReturnType<typeof buildTenderDict>[] = [];

  for (const item of items) {
    try {
      const title = stripHtml(item.title);
      const description = stripHtml(item.description || item.content || "").slice(0, 500);
      const datePublished = parseDate(item.pubDate);
      const link = item.link;

      if (!title || !link) continue;

      // Filter by feed-specific keywords, unless this feed opts out (already
      // opportunity-focused, e.g. a grant feed).
      let matchedKeywords: string | null = null;
      if (!config.skipKeywordFilter) {
        const matched = matchKeywords(`${title} ${description}`, config.keywords);
        if (matched.length === 0) continue;
        matchedKeywords = matched.join(", ");
      }

      const tender = buildTenderDict({
        title,
        source_name: `rss_${config.name}`,
        source_url: link,
        description,
        date_published: datePublished,
        category: "News/Announcement",
        matched_keywords: matchedKeywords,
        opportunity_type: config.opportunity_type || "tender",
      });

      tenders.push(tender);
    } catch (_err) {
      // Skip individual items that fail to parse
    }
  }

  return tenders;
}

async function processFeed(config: RSSFeedConfig) {
  const startTime = Date.now();

  try {
    const items = await fetchFeed(config);

    if (items.length === 0) {
      console.log(`No items found from ${config.name}`);
      await logScraperRun({
        source_name: `rss_${config.name}`,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No items returned from RSS feed",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: `rss_${config.name}`, scraped: 0, inserted: 0, success: false };
    }

    const tenders = extractTenders(items, config);
    console.log(`Kept ${tenders.length}/${items.length} items from ${config.name}`);

    if (tenders.length === 0) {
      console.log(`No items matched keywords from ${config.name}`);
      await logScraperRun({
        source_name: `rss_${config.name}`,
        scraped_count: 0,
        inserted_count: 0,
        success: true,
        error_message: null,
        elapsed_ms: Date.now() - startTime,
      });
      return { source: `rss_${config.name}`, scraped: 0, inserted: 0, success: true };
    }

    const inserted = await insertTendersBulk(tenders);
    const success = inserted > 0;

    console.log(`✓ Inserted ${inserted}/${tenders.length} items into Supabase`);

    await logScraperRun({
      source_name: `rss_${config.name}`,
      scraped_count: tenders.length,
      inserted_count: inserted,
      success,
      error_message: success ? null : "No items were inserted",
      elapsed_ms: Date.now() - startTime,
    });

    return {
      source: `rss_${config.name}`,
      scraped: tenders.length,
      inserted,
      success,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Error processing ${config.name}:`, message);

    await logScraperRun({
      source_name: `rss_${config.name}`,
      scraped_count: 0,
      inserted_count: 0,
      success: false,
      error_message: message,
      elapsed_ms: Date.now() - startTime,
    });

    return { source: `rss_${config.name}`, scraped: 0, inserted: 0, success: false };
  }
}

export async function runRssScraper() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Running RSS Feeds scraper...`);
  console.log(`${"=".repeat(80)}\n`);

  const results = [];

  for (const feed of RSS_FEEDS) {
    const result = await processFeed(feed);
    results.push(result);
  }

  return results;
}
