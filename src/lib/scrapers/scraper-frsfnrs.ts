/**
 * FRS-FNRS (Fonds de la Recherche Scientifique - Fonds National de la Recherche Scientifique)
 * Belgian Research Council - Scrapers funding opportunities from their listing page.
 *
 * Structure: Static HTML with `node--type-financing financing-teaser` divs
 * Contains title, metadata badges (scientific field, status, type), and data table with opening/closing dates
 */

import { DEFAULT_HEADERS } from "./config";
import {
  buildOpportunityDict,
  fetchWithRetry,
  insertOpportunitiesBulk,
  logScraperRun,
  stripHtml,
} from "./utils";

interface FRSFunding {
  title: string;
  description: string;
  openingDate: string | null;
  closingDate: string | null;
  category: string;
  scientificFields: string[];
  status: string;
  url: string;
}

const SOURCE = {
  name: "frs_fnrs",
  url: "https://www.frs-fnrs.be/en/fundings/",
};

/**
 * Parse ISO datetime string (2026-08-25T12:00:00Z) to date only (2026-08-25)
 */
function parseDateTime(dateTimeStr: string): string | null {
  try {
    const match = dateTimeStr.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract funding opportunities from HTML
 */
function parseFundings(html: string): FRSFunding[] {
  const fundings: FRSFunding[] = [];

  // Split by each funding item (node--type-financing)
  const itemRegex = /<div class="node node--type-financing[^>]*>([\s\S]*?)(?=<div class="node node--type-financing|$)/g;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const itemHtml = match[1];

    // Extract title from financing-teaser__title
    const titleMatch = itemHtml.match(/<h2 class="financing-teaser__title">([\s\S]*?)<\/h2>/);
    if (!titleMatch) continue;

    const titleRaw = titleMatch[1];
    const titleSpan = titleRaw.match(/<span[^>]*>(.*?)<\/span>/);
    const title = titleSpan ? stripHtml(titleSpan[1]) : stripHtml(titleRaw);

    if (!title) continue;

    // Extract badges (scientific field, status, type)
    const badgeRegex = /<span class="field__item">(.*?)<\/span>/g;
    const scientificFields: string[] = [];
    let badgeMatch;

    while ((badgeMatch = badgeRegex.exec(itemHtml)) !== null) {
      const badgeText = stripHtml(badgeMatch[1]).trim();
      if (badgeText && badgeText.length < 50) {
        // Filter out long text that's not badges
        scientificFields.push(badgeText);
      }
    }

    // Extract opening date from <dt>Opening</dt> <dd> <time datetime="...">
    let openingDate: string | null = null;
    const openingMatch = itemHtml.match(/<dt>Opening<\/dt>\s*<dd>[^<]*<time datetime="([^"]*)"/);
    if (openingMatch) {
      openingDate = parseDateTime(openingMatch[1]);
    }

    // Extract closing date from <dt>Closing</dt> <dd> <time datetime="...">
    let closingDate: string | null = null;
    const closingMatch = itemHtml.match(/<dt>Closing<\/dt>\s*<dd>[^<]*<time datetime="([^"]*)"/);
    if (closingMatch) {
      closingDate = parseDateTime(closingMatch[1]);
    }

    // Extract category from <dt>Category</dt> <dd>
    let category = "Research";
    const categoryMatch = itemHtml.match(/<dt>Category<\/dt>\s*<dd>\s*([^<]+)/);
    if (categoryMatch) {
      category = stripHtml(categoryMatch[1]).trim();
    }

    // Extract status (from badge)
    let status = "Open";
    const statusMatch = itemHtml.match(/badge__status-([^\s"]+)/);
    if (statusMatch) {
      status = statusMatch[1].includes("in_progress") ? "In Progress" : "Open";
    }

    // Build description from category and scientific fields
    const description = [category, ...scientificFields].filter(Boolean).join(" | ").slice(0, 500);

    // Extract unique URL for each funding opportunity
    let fundingUrl = SOURCE.url;
    const linkMatch = itemHtml.match(/<a[^>]*href="([^"]*)"[^>]*>/);
    if (linkMatch) {
      const href = linkMatch[1];
      if (href && !href.startsWith("javascript:")) {
        fundingUrl = href.startsWith("http") ? href : new URL(href, SOURCE.url).toString();
      }
    }

    fundings.push({
      title,
      description,
      openingDate,
      closingDate,
      category,
      scientificFields,
      status,
      url: fundingUrl,
    });
  }

  return fundings;
}

async function fetchFRSFundings(): Promise<FRSFunding[]> {
  console.log(`Fetching FRS-FNRS fundings from ${SOURCE.url}...`);

  const response = await fetchWithRetry(SOURCE.url, {
    headers: { ...DEFAULT_HEADERS, Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseFundings(html);
}

export async function runFRSFNRSScraper() {
  const startTime = Date.now();

  try {
    const fundings = await fetchFRSFundings();
    console.log(`✓ Found ${fundings.length} FRS-FNRS fundings`);

    if (fundings.length === 0) {
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No fundings found on listing page",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    // Convert to opportunities format
    const opportunities = fundings.map(funding =>
      buildOpportunityDict({
        title: funding.title,
        source_name: SOURCE.name,
        source_url: funding.url,
        description: funding.description,
        date_published: funding.openingDate,
        deadline: funding.closingDate,
        category: funding.category,
        opportunity_type: "grant",
      })
    );

    // Insert to database
    const inserted = await insertOpportunitiesBulk(opportunities);
    console.log(`✓ Inserted ${inserted}/${opportunities.length} opportunities`);

    // Log success
    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: fundings.length,
      inserted_count: inserted,
      success: true,
      error_message: null,
      elapsed_ms: Date.now() - startTime,
    });

    return { source: SOURCE.name, scraped: fundings.length, inserted, success: true };
  } catch (err) {
    const error_message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Error scraping FRS-FNRS:`, error_message);

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
