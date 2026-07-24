/**
 * Scraper registry - dynamically loads and runs scrapers
 * This pattern allows new scrapers to be added without modifying this file
 */

import { REQUEST_DELAY } from "./config";
import { runBurroughsWellcomeScraper } from "./scraper-burroughs-wellcome";
import { runEICScraper } from "./scraper-eic";
import { runEITFoodScraper } from "./scraper-eitfood";
import { runEtendersScraper } from "./scraper-etenders";
import { runFRSFNRSScraper } from "./scraper-frsfnrs";
import { runGIZScraper } from "./scraper-giz";
import { runInnoLightScraper } from "./scraper-innolight";
import { runLondonCFScraper } from "./scraper-londoncf";
// nigeriatenders.com disabled 2026-07-24: site now loads tender listings via
// client-side JS, so fetch() only ever sees an empty shell. See TODO.md for details.
// import { runNigeriaTendersScraper } from "./scraper-nigeriatenders";
import { runNovoNordiskScraper } from "./scraper-novo-nordisk";
import { listRssSourceNames, runRssScraper } from "./scraper-rss";
import { runTenderNgScraper } from "./scraper-tender-ng";
// thisdaylive.com and vanguardngr.com disabled 2026-07-24: low yield relative to
// cron runtime cost. See TODO.md for the Cloudflare/keyword-filtering research
// behind these two and how to bring them back.
// import { runThisDayScraper } from "./scraper-thisday";
// import { runVanguardScraper } from "./scraper-vanguard";
import { sleep } from "./utils";

export type ScraperResult = {
  source: string;
  scraped: number;
  inserted: number;
  success: boolean;
};

type ScraperFunction = () => Promise<ScraperResult | ScraperResult[]>;

/**
 * Registry of all available scrapers
 * To add a new scraper: import it and add to this array
 * No changes needed to the cron job or scheduling logic
 *
 * Note: Some scrapers (e.g., RSS) return multiple results (one per feed)
 * The runAllScrapers function flattens these automatically
 */
const SCRAPERS: { name: string; fn: ScraperFunction }[] = [
  { name: "etenders.com.ng", fn: runEtendersScraper },
  { name: "tender.ng", fn: runTenderNgScraper },
  // { name: "nigeriatenders.com", fn: runNigeriaTendersScraper }, // disabled, see TODO.md
  // { name: "thisdaylive.com", fn: runThisDayScraper }, // disabled, see TODO.md
  // { name: "vanguardngr.com", fn: runVanguardScraper }, // disabled, see TODO.md
  { name: "rss_feeds", fn: runRssScraper },
  { name: "innolight_qatar", fn: runInnoLightScraper },
  { name: "giz_tenders", fn: runGIZScraper },
  { name: "londoncf", fn: runLondonCFScraper },
  { name: "frs_fnrs", fn: runFRSFNRSScraper },
  { name: "eitfood", fn: runEITFoodScraper },
  { name: "novo_nordisk", fn: runNovoNordiskScraper },
  { name: "burroughs_wellcome", fn: runBurroughsWellcomeScraper },
  { name: "eic", fn: runEICScraper },
  // Future scrapers go here:
  // { name: "bpp.gov.ng", fn: runBppScraper },
  // { name: "reddit", fn: runRedditScraper },
];

/**
 * Run all registered scrapers
 */
export async function runAllScrapers(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  console.log(`\n${"=".repeat(80)}`);
  console.log(`🚀 Running ${SCRAPERS.length} scrapers...`);
  console.log(`${"=".repeat(80)}\n`);

  for (let i = 0; i < SCRAPERS.length; i++) {
    const scraper = SCRAPERS[i];
    try {
      console.log(`\nStarting: ${scraper.name}`);
      const result = await scraper.fn();
      // Handle both single result and array of results
      if (Array.isArray(result)) {
        results.push(...result);
      } else {
        results.push(result);
      }
      console.log(`✓ Completed: ${scraper.name}`);
    } catch (err) {
      console.error(`✗ Error running ${scraper.name}:`, err);
      results.push({
        source: scraper.name,
        scraped: 0,
        inserted: 0,
        success: false,
      });
    }

    // Pause between sources so we don't hit multiple sites back-to-back with no gap
    if (i < SCRAPERS.length - 1) {
      await sleep(REQUEST_DELAY);
    }
  }

  return results;
}

/**
 * Run a single scraper by name
 */
export async function runScraperByName(name: string): Promise<ScraperResult | ScraperResult[] | null> {
  const scraper = SCRAPERS.find((s) => s.name === name);
  if (!scraper) {
    console.error(`Scraper not found: ${name}`);
    return null;
  }

  try {
    return await scraper.fn();
  } catch (err) {
    console.error(`Error running ${name}:`, err);
    return {
      source: name,
      scraped: 0,
      inserted: 0,
      success: false,
    };
  }
}

/**
 * Get list of available scrapers
 */
export function listScrapers(): string[] {
  return SCRAPERS.map((s) => s.name);
}

/**
 * Real `source_name` values currently-active scrapers can write to the database.
 * Expands the single "rss_feeds" registry entry into its actual per-feed names
 * (e.g. "rss_ukri", "rss_businessday") since that's what's actually stored on each
 * opportunity row, not the registry entry name itself.
 *
 * Used to filter the dashboard's source list down to sources that still run today,
 * without deleting historical data from disabled sources (see TODO.md).
 */
export function listActiveSourceNames(): string[] {
  return SCRAPERS.flatMap((s) => (s.name === "rss_feeds" ? listRssSourceNames() : s.name));
}
