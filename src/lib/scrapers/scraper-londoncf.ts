/**
 * London Community Foundation (londoncf.org.uk) scraper
 * Fetches available grants from the London Community Foundation's grants listing page.
 *
 * Structure: Static HTML with `filtered-content__item` divs containing grant info
 * No API, no JavaScript required - direct HTML parsing
 */

import { DEFAULT_HEADERS } from "./config";
import {
  buildOpportunityDict,
  fetchWithRetry,
  insertOpportunitiesBulk,
  logScraperRun,
  stripHtml,
} from "./utils";

interface LondonCFGrant {
  title: string;
  description: string;
  closingDate: string | null;
  status: string;
  url: string;
  grantId?: string;
}

const SOURCE = {
  name: "londoncf",
  url: "https://londoncf.org.uk/apply/available-grants",
};

/**
 * Parse closing date from format like "21/07/2026" to ISO "2026-07-21"
 * Also handles "ongoing" or other text formats
 */
function parseClosingDate(dateStr: string): string | null {
  const dateStr_clean = dateStr.trim();

  // Match DD/MM/YYYY format
  const match = dateStr_clean.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  // If it says "Closed" or "ongoing", return null (no specific deadline)
  if (dateStr_clean.toLowerCase().includes("closed") ||
      dateStr_clean.toLowerCase().includes("ongoing")) {
    return null;
  }

  return null;
}

/**
 * Extract grants from HTML using regex patterns
 */
function parseGrants(html: string): LondonCFGrant[] {
  const grants: LondonCFGrant[] = [];

  // Split by each grant item div
  const itemRegex = /<div class="filtered-content__item"[^>]*>([\s\S]*?)(?=<div class="filtered-content__item"|$)/g;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const itemHtml = match[1];

    // Extract title from <h4> tag and parse closing date + status
    const titleMatch = itemHtml.match(/<h4>(.*?)<\/h4>/);
    if (!titleMatch) continue;

    const titleFull = stripHtml(titleMatch[1]);

    // Title format: "Name | Closing date: DD/MM/YYYY <span> Status</span>"
    const titleParts = titleFull.split(" | Closing date: ");
    const title = titleParts[0]?.trim() || "";

    let closingDate: string | null = null;
    let status = "Unknown";

    if (titleParts[1]) {
      // Parse "DD/MM/YYYY <span> Status</span>" or just "DD/MM/YYYY Status"
      const dateAndStatus = titleParts[1];
      const dateMatch = dateAndStatus.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (dateMatch) {
        closingDate = parseClosingDate(dateMatch[1]);
      }

      // Extract status (Open, Closed, etc.)
      const statusMatch = dateAndStatus.match(/\s(Open|Closed|Closing Soon)\s*$/);
      if (statusMatch) {
        status = statusMatch[1];
      }
    }

    // Extract description from filtered-content__item-description div
    const descriptionMatch = itemHtml.match(/<div class="filtered-content__item-description"[^>]*>([\s\S]*?)<\/div>/);
    const description = descriptionMatch
      ? stripHtml(descriptionMatch[1]).slice(0, 500).trim()
      : "";

    // Extract grant ID from link if available
    let grantUrl = SOURCE.url;
    const linkMatch = itemHtml.match(/<a[^>]*href="([^"]*)"[^>]*>/);
    if (linkMatch) {
      const href = linkMatch[1];
      if (href && !href.startsWith("javascript:")) {
        grantUrl = href.startsWith("http") ? href : new URL(href, SOURCE.url).toString();
      }
    }

    if (title && description) {
      grants.push({
        title,
        description,
        closingDate,
        status,
        url: grantUrl,
      });
    }
  }

  return grants;
}

async function fetchLondonCFGrants(): Promise<LondonCFGrant[]> {
  console.log(`Fetching London Community Foundation grants from ${SOURCE.url}...`);

  const response = await fetchWithRetry(SOURCE.url, {
    headers: { ...DEFAULT_HEADERS, Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseGrants(html);
}

export async function runLondonCFScraper() {
  const startTime = Date.now();

  try {
    const grants = await fetchLondonCFGrants();
    console.log(`✓ Found ${grants.length} London Community Foundation grants`);

    if (grants.length === 0) {
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No grants found on listing page",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    // Convert to opportunities format
    const opportunities = grants.map(grant =>
      buildOpportunityDict({
        title: grant.title,
        source_name: SOURCE.name,
        source_url: grant.url,
        description: grant.description,
        deadline: grant.closingDate,
        category: "Grant",
        opportunity_type: "grant",
      })
    );

    // Insert to database
    const inserted = await insertOpportunitiesBulk(opportunities);
    console.log(`✓ Inserted ${inserted}/${opportunities.length} opportunities`);

    // Log success
    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: grants.length,
      inserted_count: inserted,
      success: true,
      error_message: null,
      elapsed_ms: Date.now() - startTime,
    });

    return { source: SOURCE.name, scraped: grants.length, inserted, success: true };
  } catch (err) {
    const error_message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Error scraping London Community Foundation:`, error_message);

    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: 0,
      inserted_count: 0,
      success: false,
      error_message,
      elapsed_ms: Date.now() - startTime,
    });

    return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
  }
}
