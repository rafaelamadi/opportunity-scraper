/**
 * tender.ng scraper
 * Fetches tenders from HTML - ICT category
 */

import { DEFAULT_HEADERS, SOURCES } from "./config";
import { buildTenderDict, fetchWithRetry, insertTendersBulk, logScraperRun, parseDate, stripHtml } from "./utils";

const SOURCE = SOURCES.tender_ng;

async function fetchTenderListings(page = 1): Promise<string> {
  const url = SOURCE.url;
  const params = new URLSearchParams({
    category_id: String(SOURCE.category_id),
    page: String(page),
  });

  console.log(`Fetching page ${page} from ${SOURCE.name}...`);
  const response = await fetchWithRetry(`${url}?${params.toString()}`, {
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.text();
}

function extractTenders(html: string) {
  const tenders: ReturnType<typeof buildTenderDict>[] = [];

  // Pattern to find tender listings
  // <a href="/tenders/view/123"><h5>Title</h5></a>
  // Followed by <li><i class="fa fa-clock-o"></i>Type</li>
  // And <li>Date</li>

  const linkRegex = /<a[^>]*href="([^"]*tenders\/view[^"]*)"><h5>([^<]+)<\/h5><\/a>/g;

  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec pattern
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const link = match[1];
      const title = stripHtml(match[2]);

      if (!title || !link) continue;

      // Extract date from the block following the link
      // Look for "Jul 21, 2026" format
      const dateRegex = /fa fa-clock-o[^<]*<\/i>([^<]+)<\/li>/;
      const afterLink = html.substring(match.index, match.index + 500);
      const dateMatch = dateRegex.exec(afterLink);
      const dateStr = dateMatch ? dateMatch[1].trim() : null;
      const deadline = dateStr ? parseDate(dateStr, "%b %d, %Y") : null;

      // Construct full URL if relative
      const fullUrl = link.startsWith("http") ? link : `${SOURCE.url}${link}`;

      const tender = buildTenderDict({
        title,
        source_name: SOURCE.name,
        source_url: fullUrl,
        description: "ICT Category Tender",
        deadline,
        category: "ICT",
        matched_keywords: null, // Pre-filtered by category
      });

      tenders.push(tender);
    } catch (_err) {
      // Skip individual tenders that fail to parse
    }
  }

  return tenders;
}

export async function runTenderNgScraper() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Running ${SOURCE.name} scraper...`);
  console.log("=".repeat(80));

  const startTime = Date.now();

  try {
    const html = await fetchTenderListings(1);
    if (!html) {
      console.log(`No HTML fetched from ${SOURCE.name}`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No HTML fetched from source",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    const tenders = extractTenders(html);
    console.log(`Extracted ${tenders.length} tenders`);

    if (tenders.length === 0) {
      console.log(`No tenders found from ${SOURCE.name}`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No tenders parsed from HTML",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    const inserted = await insertTendersBulk(tenders);
    const success = inserted > 0;

    console.log(`✓ Inserted ${inserted}/${tenders.length} tenders into Supabase`);

    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: tenders.length,
      inserted_count: inserted,
      success,
      error_message: success ? null : "No tenders were inserted",
      elapsed_ms: Date.now() - startTime,
    });

    return {
      source: SOURCE.name,
      scraped: tenders.length,
      inserted,
      success,
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
