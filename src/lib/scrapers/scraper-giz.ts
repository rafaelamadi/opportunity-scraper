/**
 * GIZ Tenders scraper (Pan-Africa / Global development sector)
 * Fetches tenders from GIZ's procurement marketplace (Vergabemarktplatz).
 *
 * Discovery note: the marketing page at giz.de/.../tenders is JS-rendered and useless,
 * but GIZ runs a separate server-rendered procurement portal at ausschreibungen.giz.de
 * that returns a plain HTML table of live tenders. No headless browser needed.
 *
 * Tenders are development-sector consulting opportunities in English, German and French.
 * We capture all of them (broad opportunity discovery); translation is layered on separately.
 */

import { DEFAULT_HEADERS } from "./config";
import {
  buildOpportunityDict,
  fetchWithRetry,
  insertOpportunitiesBulk,
  logScraperRun,
  stripHtml,
} from "./utils";

interface GIZTender {
  title: string;
  link: string;
  publicationDate: string | null;
  deadline: string | null;
  type: string;
  issuer: string;
  isAwarded: boolean;
}

const SOURCE = {
  name: "giz_tenders",
  url: "https://ausschreibungen.giz.de/Satellite/company/welcome.do",
  base: "https://ausschreibungen.giz.de",
};

/**
 * Convert German date format (DD.MM.YYYY) to ISO (YYYY-MM-DD)
 */
function parseGermanDate(dateStr: string): string | null {
  const match = dateStr.trim().match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function cellText(tdHtml: string | undefined): string {
  if (!tdHtml) return "";
  return stripHtml(tdHtml.replace(/\s+/g, " ")).trim();
}

async function fetchGIZTenders(): Promise<GIZTender[]> {
  console.log(`Fetching GIZ tenders from ${SOURCE.url}...`);

  const response = await fetchWithRetry(SOURCE.url, {
    headers: { ...DEFAULT_HEADERS, Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  // GIZ portal serves latin-1 / ISO-8859-1 encoded HTML
  const buffer = await response.arrayBuffer();
  const html = new TextDecoder("iso-8859-1").decode(buffer);

  return parseGIZTable(html);
}

/**
 * Parse the GIZ procurement table.
 * Rows come in two shapes:
 *  - 5 cells (open tender): [publicationDate, deadline, title, type, issuer]
 *  - 4 cells (awarded/closed): [publicationDate, title, type, issuer] (no deadline)
 * Every data row contains a projectForwarding.do?pid=XXX detail link.
 */
function parseGIZTable(html: string): GIZTender[] {
  const tenders: GIZTender[] = [];

  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    if (!row.includes("projectForwarding")) continue;

    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
    const pidMatch = row.match(/pid=(\d+)/);
    if (!pidMatch) continue;

    const link = `${SOURCE.base}/Satellite/public/company/projectForwarding.do?pid=${pidMatch[1]}`;

    let publicationDate: string | null = null;
    let deadline: string | null = null;
    let title = "";
    let type = "";
    let issuer = "";

    if (cells.length >= 5) {
      // Open tender: date, deadline, title, type, issuer
      publicationDate = parseGermanDate(cellText(cells[0]));
      deadline = parseGermanDate(cellText(cells[1]));
      title = cellText(cells[2]);
      type = cellText(cells[3]);
      issuer = cellText(cells[4]);
    } else if (cells.length === 4) {
      // Awarded/closed: date, title, type, issuer (no deadline)
      publicationDate = parseGermanDate(cellText(cells[0]));
      title = cellText(cells[1]);
      type = cellText(cells[2]);
      issuer = cellText(cells[3]);
    } else {
      continue;
    }

    if (!title) continue;

    // "Vergebener Auftrag" = awarded contract (already closed)
    const isAwarded = /vergebener auftrag/i.test(type) || /vergebener auftrag/i.test(title);

    tenders.push({
      title,
      link,
      publicationDate,
      deadline,
      type: type.replace(/\s+/g, " ").trim(),
      issuer,
      isAwarded,
    });
  }

  console.log(`✓ Parsed ${tenders.length} tenders from GIZ portal`);
  return tenders;
}

function extractOpportunities(tenders: GIZTender[]) {
  const results: ReturnType<typeof buildOpportunityDict>[] = [];

  for (const tender of tenders) {
    try {
      // Skip already-awarded contracts - they're not actionable opportunities
      if (tender.isAwarded) continue;
      if (!tender.title || !tender.link) continue;

      const description = [tender.type, tender.issuer].filter(Boolean).join(" — ");

      const opportunity = buildOpportunityDict({
        title: tender.title,
        source_name: SOURCE.name,
        source_url: tender.link,
        description,
        date_published: tender.publicationDate,
        deadline: tender.deadline,
        category: tender.type || "Development Tender",
        matched_keywords: null,
        opportunity_type: "tender",
      });

      results.push(opportunity);
    } catch (_err) {
      // Skip individual rows that fail to parse
    }
  }

  return results;
}

export async function runGIZScraper() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Running ${SOURCE.name} scraper (HTML portal)`);
  console.log("=".repeat(80));

  const startTime = Date.now();

  try {
    const tenders = await fetchGIZTenders();

    if (tenders.length === 0) {
      console.log(`No tenders found from ${SOURCE.name}`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No tenders parsed from GIZ portal",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    const results = extractOpportunities(tenders);
    console.log(`Keeping ${results.length}/${tenders.length} open tenders (excluding awarded contracts)`);

    if (results.length === 0) {
      console.log(`No open tenders found from ${SOURCE.name}`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: true,
        error_message: null,
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: true };
    }

    const inserted = await insertOpportunitiesBulk(results);
    console.log(`✓ Inserted ${inserted}/${results.length} tenders into Supabase`);

    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: results.length,
      inserted_count: inserted,
      success: true,
      error_message: null,
      elapsed_ms: Date.now() - startTime,
    });

    return {
      source: SOURCE.name,
      scraped: results.length,
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
