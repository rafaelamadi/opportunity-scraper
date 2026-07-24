/**
 * InnoLight Qatar Opportunities Scraper
 * Fetches funding/innovation opportunities from Qatar Research, Development
 * and Innovation Council (QRDI) via their public JSON API.
 *
 * Discovery note: the page at innolight.qrdi.org.qa looks JS-rendered (Angular SPA),
 * but the underlying data comes from a plain REST endpoint gated only by a
 * client id/secret pair that ships in the frontend JS bundle (not a real secret).
 * No headless browser is required - a normal HTTP fetch with these headers works.
 */

import { DEFAULT_HEADERS, ICT_KEYWORDS } from "./config";
import {
  buildOpportunityDict,
  fetchWithRetry,
  insertOpportunitiesBulk,
  logScraperRun,
  matchKeywords,
  parseDate,
  stripHtml,
} from "./utils";

interface InnoLightApiItem {
  id: number;
  name: string;
  typeName: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  isClosed: boolean;
  isPublished: boolean;
  isDeleted: boolean;
  owners?: { entityName: string; url?: string }[];
  criterias?: { title: string; description: string }[];
}

interface InnoLightApiResponse {
  paging: { totalItems: number; page: number; limit: number; totalPages: number };
  items: InnoLightApiItem[];
}

const SOURCE = {
  name: "innolight_qatar",
  api_url: "https://innolight.qrdi.org.qa/api/opportunity/funding?page=1&limit=200",
  page_url: "https://innolight.qrdi.org.qa/en/opportunities/p?tab=business-innovation",
};

// Client credentials embedded in InnoLight's public frontend bundle (gatekeeper, not a real secret)
const API_HEADERS = {
  ...DEFAULT_HEADERS,
  Accept: "application/json, text/plain, */*",
  Referer: SOURCE.page_url,
  "x-client-id": "Innolight_Web",
  "x-client-secret": "f8d92c7a-9f4b-4d2e-9c2a-7b8e2c9f1a44",
  "Content-Type": "application/json",
};

async function fetchInnoLightOpportunities(): Promise<InnoLightApiItem[]> {
  console.log(`Fetching InnoLight opportunities from ${SOURCE.api_url}...`);

  const response = await fetchWithRetry(SOURCE.api_url, { headers: API_HEADERS });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data: InnoLightApiResponse = await response.json();
  console.log(`✓ Fetched ${data.items.length}/${data.paging.totalItems} opportunities from API`);

  return data.items;
}

function buildCriteriaSummary(criterias?: { title: string; description: string }[]): string {
  if (!criterias || criterias.length === 0) return "";
  return criterias.map((c) => `${c.title}: ${c.description}`).join(" | ");
}

function extractOpportunities(items: InnoLightApiItem[]) {
  const results: ReturnType<typeof buildOpportunityDict>[] = [];

  for (const item of items) {
    try {
      if (item.isDeleted || !item.isPublished) continue;
      // Only keep currently open opportunities - closed ones are historical/awarded
      if (item.isClosed) continue;

      const title = stripHtml(item.name);
      const description = stripHtml(item.description || "");
      const criteria = buildCriteriaSummary(item.criterias);
      const fullText = `${title} ${description} ${item.typeName} ${criteria}`;

      if (!title) continue;

      const matched = matchKeywords(fullText, ICT_KEYWORDS);
      if (matched.length === 0) continue;

      const owner = item.owners?.[0];
      const link = owner?.url || SOURCE.page_url;

      const opportunity = buildOpportunityDict({
        title,
        source_name: SOURCE.name,
        source_url: link,
        description: criteria ? `${description}\n\n${criteria}` : description,
        date_published: item.startDate ? parseDate(item.startDate) : null,
        deadline: item.endDate ? parseDate(item.endDate) : null,
        category: item.typeName || "Business Innovation",
        matched_keywords: matched.join(", "),
        opportunity_type: "grant",
      });

      results.push(opportunity);
    } catch (_err) {
      // Skip individual items that fail to parse
    }
  }

  return results;
}

export async function runInnoLightScraper() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Running ${SOURCE.name} scraper (HTTP API)`);
  console.log("=".repeat(80));

  const startTime = Date.now();

  try {
    const items = await fetchInnoLightOpportunities();

    if (items.length === 0) {
      console.log(`No opportunities found from ${SOURCE.name}`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No items returned from InnoLight API",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    const results = extractOpportunities(items);
    console.log(
      `Matched ${results.length}/${items.length} open opportunities against ICT keywords`
    );

    if (results.length === 0) {
      console.log(`No ICT-relevant open opportunities found from ${SOURCE.name}`);
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
    console.log(`✓ Inserted ${inserted}/${results.length} opportunities into Supabase`);

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
