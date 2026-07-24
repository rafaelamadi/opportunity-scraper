/**
 * EIT Food (eitfood.eu) Open Calls scraper
 * Fetches food innovation funding opportunities from EIT Food's open calls listing page.
 *
 * Structure: Static HTML with card grid layout
 * Contains title, deadline, and description text
 */

import { DEFAULT_HEADERS } from "./config";
import {
  buildOpportunityDict,
  fetchWithRetry,
  insertOpportunitiesBulk,
  logScraperRun,
  stripHtml,
} from "./utils";

interface EITCall {
  title: string;
  link: string;
  deadline: string | null;
  description: string;
}

const SOURCE = {
  name: "eitfood",
  url: "https://www.eitfood.eu/open-calls/",
};

/**
 * Parse deadline like "July 18, 2026" to ISO "2026-07-18"
 */
function parseDeadline(deadlineStr: string): string | null {
  try {
    // Format: "Month DD, YYYY"
    const match = deadlineStr.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/);
    if (!match) return null;

    const monthStr = match[1];
    const day = match[2].padStart(2, "0");
    const year = match[3];

    const months: { [key: string]: string } = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    };

    const month = months[monthStr.toLowerCase()];
    if (!month) return null;

    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Extract EIT Food calls from HTML
 * The page uses a grid layout with card elements containing title, deadline, and description
 */
function parseCalls(html: string): EITCall[] {
  const calls: EITCall[] = [];

  // Find all deadline occurrences to extract unique calls
  const deadlineRegex = /Deadline:\s*([^<]+)</g;
  const deadlines: string[] = [];
  let match;

  while ((match = deadlineRegex.exec(html)) !== null) {
    deadlines.push(match[1].trim());
  }

  // Find all open call links
  const linkRegex = /<a[^>]*href="https:\/\/www\.eitfood\.eu\/open-calls\/([^"]+)"[^>]*>\s*([^<]+)\s*<\/a>/g;
  const links: Array<{ slug: string; title: string }> = [];

  while ((match = linkRegex.exec(html)) !== null) {
    links.push({
      slug: match[1],
      title: stripHtml(match[2]).trim(),
    });
  }

  // Create calls from links and deadlines
  // Match them up - we have more deadlines than unique calls due to page structure
  const uniqueCalls = new Set<string>();

  for (const link of links) {
    if (!uniqueCalls.has(link.slug)) {
      uniqueCalls.add(link.slug);

      // Find corresponding deadline
      // Search for the deadline that appears near this call in the HTML
      const callSection = html.match(
        new RegExp(
          `href="https:\\/\\/www\\.eitfood\\.eu\\/open-calls\\/${link.slug}"[\\s\\S]{0,1000}?Deadline:[\\s]*([^<]+)`,
          "i"
        )
      );

      let deadline: string | null = null;
      if (callSection && callSection[1]) {
        deadline = parseDeadline(callSection[1].trim());
      }

      calls.push({
        title: link.title,
        link: `https://www.eitfood.eu/open-calls/${link.slug}`,
        deadline,
        description: "EIT Food is the EU's leading food innovation initiative.",
      });
    }
  }

  return calls;
}

async function fetchEITCalls(): Promise<EITCall[]> {
  console.log(`Fetching EIT Food open calls from ${SOURCE.url}...`);

  const response = await fetchWithRetry(SOURCE.url, {
    headers: { ...DEFAULT_HEADERS, Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseCalls(html);
}

export async function runEITFoodScraper() {
  const startTime = Date.now();

  try {
    const calls = await fetchEITCalls();
    console.log(`✓ Found ${calls.length} EIT Food open calls`);

    if (calls.length === 0) {
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No calls found on listing page",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    // Convert to opportunities format
    const opportunities = calls.map(call =>
      buildOpportunityDict({
        title: call.title,
        source_name: SOURCE.name,
        source_url: call.link,
        description: call.description,
        deadline: call.deadline,
        category: "Food Innovation",
        opportunity_type: "grant",
      })
    );

    // Insert to database
    const inserted = await insertOpportunitiesBulk(opportunities);
    console.log(`✓ Inserted ${inserted}/${opportunities.length} opportunities`);

    // Log success
    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: calls.length,
      inserted_count: inserted,
      success: true,
      error_message: null,
      elapsed_ms: Date.now() - startTime,
    });

    return { source: SOURCE.name, scraped: calls.length, inserted, success: true };
  } catch (err) {
    const error_message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Error scraping EIT Food:`, error_message);

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
