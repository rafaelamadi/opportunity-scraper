/**
 * European Innovation Council (EIC) Scraper
 * Scrapes major EIC funding opportunities from the European Commission
 * These are manually curated high-value opportunities for innovative startups and SMEs
 */

import {
  buildOpportunityDict,
  insertOpportunitiesBulk,
  logScraperRun,
} from "./utils";

interface EICOpportunity {
  title: string;
  url: string;
  description: string;
  deadline: string | null;
}

const SOURCE = {
  name: "eic",
  url: "https://eic.ec.europa.eu/",
};

// EIC major funding opportunities (manually curated)
const EIC_OPPORTUNITIES: EICOpportunity[] = [
  {
    title: "EIC Accelerator - Breakthrough Innovation Grants",
    url: "https://eic.ec.europa.eu/eic-funding/eic-accelerator_en",
    description:
      "The EIC Accelerator supports game-changing start-ups and SMEs with a high innovation potential and growth capacity. Grants up to €2.5 million plus equity investment component (up to €10 million). Open call with continuous evaluation and batched decision dates.",
    deadline: null, // Ongoing open call
  },
  {
    title: "EIC Transition - Pre-Commercial Support",
    url: "https://eic.ec.europa.eu/eic-funding/eic-transition_en",
    description:
      "The EIC Transition supports researchers and teams with a solid research result to develop it towards market deployment. €100M fund with grants up to €2.5 million for researchers transitioning to entrepreneurship.",
    deadline: "2026-09-16",
  },
  {
    title: "EIC Pathfinder - Groundbreaking Research",
    url: "https://eic.ec.europa.eu/eic-funding/eic-pathfinder_en",
    description:
      "The EIC Pathfinder supports visionary ideas at the frontier of science and technology with high innovation potential. Grants to explore the technological and scientific feasibility of radically new ideas.",
    deadline: null, // Check portal for next call
  },
];

export async function runEICScraper() {
  const startTime = Date.now();

  try {
    console.log(`Processing ${EIC_OPPORTUNITIES.length} EIC funding opportunities...`);

    // Convert to opportunities format
    const opportunities = EIC_OPPORTUNITIES.map((eic) =>
      buildOpportunityDict({
        title: eic.title,
        source_name: SOURCE.name,
        source_url: eic.url,
        description: eic.description,
        deadline: eic.deadline,
        category: "Innovation Funding",
        opportunity_type: "grant",
      })
    );

    // Insert to database
    const inserted = await insertOpportunitiesBulk(opportunities);
    console.log(`✓ Inserted ${inserted}/${opportunities.length} EIC opportunities`);

    // Log success
    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: EIC_OPPORTUNITIES.length,
      inserted_count: inserted,
      success: true,
      error_message: null,
      elapsed_ms: Date.now() - startTime,
    });

    return {
      source: SOURCE.name,
      scraped: EIC_OPPORTUNITIES.length,
      inserted,
      success: true,
    };
  } catch (err) {
    const error_message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Error processing EIC opportunities:`, error_message);

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
