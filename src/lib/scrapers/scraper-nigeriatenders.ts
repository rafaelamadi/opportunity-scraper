/**
 * nigeriatenders.com scraper
 * Fetches tenders from HTML - IT & Softwares category
 */

import { DEFAULT_HEADERS, SOURCES } from "./config";
import { buildTenderDict, fetchWithRetry, insertTendersBulk, logScraperRun, parseDate, stripHtml } from "./utils";

const SOURCE = SOURCES.nigeriatenders;

async function fetchTenderListings(page = 1): Promise<string> {
  const url = `${SOURCE.url}/tenders/search`;
  const params = new URLSearchParams({
    category: SOURCE.category,
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

  // Split by tender-card divs
  // Each tender is wrapped in: <div class="tender-card">...</div>
  // Inside: <a href="..."><p class="tender-card-heading">Title</p></a>
  // Deadline: <i class="fa fa-clock"></i>...: Date</p>

  const tenderBlocks = html.split('<div class="tender-card"');

  for (const block of tenderBlocks.slice(1)) {
    try {
      // Extract the link and title
      const linkRegex = /<a href="([^"]+)"><p class="tender-card-heading">([^<]+)<\/p><\/a>/;
      const linkMatch = linkRegex.exec(block);

      if (!linkMatch) continue;

      const link = linkMatch[1];
      const title = stripHtml(linkMatch[2]);

      // Extract deadline: "Deadline:&nbsp;&nbsp;18 Aug 2026"
      const deadlineRegex = /<i class="fa fa-clock"><\/i>[^:]*:\s*([^<]+)<\/p>/;
      const deadlineMatch = deadlineRegex.exec(block);
      const deadlineStr = deadlineMatch ? deadlineMatch[1].trim() : null;

      let deadline = null;
      if (deadlineStr) {
        try {
          // Format appears to be "18 Aug 2026"
          deadline = parseDate(deadlineStr, "%d %b %Y");
        } catch {
          // Skip deadline parsing on error
        }
      }

      // Extract reference number
      const refRegex = /NGT Ref No\.:\s*([0-9]+)/;
      const refMatch = refRegex.exec(block);
      const refNo = refMatch ? refMatch[1] : null;

      if (title && link) {
        const tender = buildTenderDict({
          title,
          source_name: SOURCE.name,
          source_url: link,
          description: refNo ? `NGT Ref: ${refNo}` : "IT & Softwares Category Tender",
          deadline,
          category: "IT & Softwares",
          matched_keywords: null, // Pre-filtered by category
        });

        tenders.push(tender);
      }
    } catch (_err) {
      // Skip individual tenders that fail to parse
    }
  }

  return tenders;
}

export async function runNigeriaTendersScraper() {
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
