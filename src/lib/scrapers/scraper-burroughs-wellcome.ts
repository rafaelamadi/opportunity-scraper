/**
 * Burroughs Wellcome Fund Scraper
 * Scrapes specific grant programs from bwfund.org
 * These are manually identified high-value opportunities
 */

import { DEFAULT_HEADERS } from "./config";
import {
  buildOpportunityDict,
  fetchWithRetry,
  insertOpportunitiesBulk,
  logScraperRun,
  stripHtml,
} from "./utils";

interface BurroughsWellcomeGrant {
  title: string;
  url: string;
  description: string;
  deadline: string | null;
}

const SOURCE = {
  name: "burroughs_wellcome",
  url: "https://www.bwfund.org/grants/",
};

// Hardcoded list of Burroughs Wellcome grant programs
const GRANT_URLS = [
  {
    url: "https://www.bwfund.org/grants/infectious-diseases/investigators-in-the-pathogenesis-of-infectious-disease/",
    title: "Investigators in the Pathogenesis of Infectious Disease (PATH)",
    deadline: "2026-07-16",
  },
  {
    url: "https://www.bwfund.org/grants/climate-change-and-human-health/climate-change-and-human-health-seed-grants/",
    title: "Climate Change and Human Health Seed Grants",
    deadline: "2026-07-23",
  },
  {
    url: "https://www.bwfund.org/grants/interfaces-in-science/career-awards-at-the-scientific-interface/",
    title: "Career Awards at the Scientific Interface (CASI)",
    deadline: "2026-08-14",
  },
];

/**
 * Fetch and parse a single grant program page
 */
async function fetchGrantDetails(grantInfo: (typeof GRANT_URLS)[0]): Promise<BurroughsWellcomeGrant> {
  try {
    const response = await fetchWithRetry(grantInfo.url, {
      headers: { ...DEFAULT_HEADERS, Accept: "text/html" },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ${grantInfo.title}: HTTP ${response.status}`);
      return {
        title: grantInfo.title,
        url: grantInfo.url,
        description: "Burroughs Wellcome Fund research grant program",
        deadline: grantInfo.deadline,
      };
    }

    const html = await response.text();

    // Extract description from page content
    // Look for grant summary or description sections
    const summaryMatch = html.match(/<div[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const description = summaryMatch
      ? stripHtml(summaryMatch[1]).slice(0, 500).trim()
      : "Burroughs Wellcome Fund research grant program supporting innovative science";

    return {
      title: grantInfo.title,
      url: grantInfo.url,
      description,
      deadline: grantInfo.deadline,
    };
  } catch (err) {
    console.warn(`Error fetching ${grantInfo.title}:`, err);
    return {
      title: grantInfo.title,
      url: grantInfo.url,
      description: "Burroughs Wellcome Fund research grant program",
      deadline: grantInfo.deadline,
    };
  }
}

export async function runBurroughsWellcomeScraper() {
  const startTime = Date.now();

  try {
    console.log(`Fetching ${GRANT_URLS.length} Burroughs Wellcome grant programs...`);

    // Fetch all grant details in parallel
    const grants = await Promise.all(GRANT_URLS.map((info) => fetchGrantDetails(info)));

    console.log(`✓ Found ${grants.length} Burroughs Wellcome grants`);

    if (grants.length === 0) {
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No grants found",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    // Convert to opportunities format
    const opportunities = grants.map((grant) =>
      buildOpportunityDict({
        title: grant.title,
        source_name: SOURCE.name,
        source_url: grant.url,
        description: grant.description,
        deadline: grant.deadline,
        category: "Research Grant",
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
    console.error(`✗ Error scraping Burroughs Wellcome:`, error_message);

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
