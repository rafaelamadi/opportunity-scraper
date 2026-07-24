/**
 * Novo Nordisk Fonden Scraper
 * Scrapes individual grant program pages from novonordiskfonden.dk
 * Each program is a separate opportunity
 */

import { DEFAULT_HEADERS } from "./config";
import {
  buildOpportunityDict,
  fetchWithRetry,
  insertOpportunitiesBulk,
  logScraperRun,
  stripHtml,
} from "./utils";

interface NovoNordiskGrant {
  title: string;
  url: string;
  description: string;
  deadline: string | null;
}

const SOURCE = {
  name: "novo_nordisk",
  url: "https://novonordiskfonden.dk/en/grants/",
};

// Hardcoded list of Novo Nordisk grant programs
const GRANT_URLS = [
  {
    url: "https://novonordiskfonden.dk/en/grant/data-science-investigator-programme/",
    title: "Data Science Investigator Programme 2026",
    deadline: "2026-07-15",
  },
  {
    url: "https://novonordiskfonden.dk/en/grant/recruit-grants-for-international-recruitment-2026/",
    title: "RECRUIT - Grants for International Recruitment, Autumn 2026",
    deadline: "2026-08-12",
  },
  {
    url: "https://novonordiskfonden.dk/en/grant/the-novo-nordisk-foundation-jacobaeus-prize-for-biomedicine/",
    title: "The Novo Nordisk Foundation Jacobæus Prize for Biomedicine",
    deadline: "2026-08-18",
  },
  {
    url: "https://novonordiskfonden.dk/en/grant/investigator-initiated-clinical-trials/",
    title: "Investigator Initiated Clinical Trials",
    deadline: "2026-08-18",
  },
  {
    url: "https://novonordiskfonden.dk/en/grant/projektstoette-i-klinisk-og-translationel-laegevidenskab/",
    title: "Project Grants in Clinical and Translational Medicine",
    deadline: "2026-08-19",
  },
  {
    url: "https://novonordiskfonden.dk/en/grant/project-grants-for-research-within-plant-science-agriculture-and-food-biotechnology/",
    title: "Project Grants - Plant Science, Agriculture and Food Biotechnology",
    deadline: "2026-08-20",
  },
  {
    url: "https://novonordiskfonden.dk/en/grant/project-grants-for-research-within-industrial-biotechnology-and-environmental-biotechnology/",
    title: "Project Grants - Industrial & Environmental Biotechnology",
    deadline: "2026-08-20",
  },
  {
    url: "https://novonordiskfonden.dk/en/grant/postdoctoral-fellowships-for-research-within-plant-science-agriculture-and-food-biotechnology/",
    title: "Postdoctoral Fellowships - Plant Science, Agriculture and Food Biotech",
    deadline: "2026-08-20",
  },
  {
    url: "https://novonordiskfonden.dk/en/grant/postdoctoral-fellowships-for-research-within-industrial-biotechnology-and-environmental-biotechnology/",
    title: "Postdoctoral Fellowships - Industrial & Environmental Biotech",
    deadline: "2026-08-20",
  },
];

/**
 * Fetch and parse a single Novo Nordisk grant program page
 */
async function fetchGrantDetails(grantInfo: (typeof GRANT_URLS)[0]): Promise<NovoNordiskGrant> {
  try {
    const response = await fetchWithRetry(grantInfo.url, {
      headers: { ...DEFAULT_HEADERS, Accept: "text/html" },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ${grantInfo.title}: HTTP ${response.status}`);
      return {
        title: grantInfo.title,
        url: grantInfo.url,
        description: "Novo Nordisk Foundation research grant program",
        deadline: grantInfo.deadline,
      };
    }

    const html = await response.text();

    // Extract description from page content
    // Look for common description patterns
    const descriptionMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const description = descriptionMatch
      ? stripHtml(descriptionMatch[1]).slice(0, 500).trim()
      : "Research grant program from Novo Nordisk Foundation";

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
      description: "Novo Nordisk Foundation research grant program",
      deadline: grantInfo.deadline,
    };
  }
}

export async function runNovoNordiskScraper() {
  const startTime = Date.now();

  try {
    console.log(`Fetching ${GRANT_URLS.length} Novo Nordisk grant programs...`);

    // Fetch all grant details in parallel
    const grants = await Promise.all(GRANT_URLS.map((info) => fetchGrantDetails(info)));

    console.log(`✓ Found ${grants.length} Novo Nordisk grants`);

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
    console.error(`✗ Error scraping Novo Nordisk:`, error_message);

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
