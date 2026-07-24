/**
 * etenders.com.ng scraper
 * Fetches tenders from the WordPress API across multiple relevant categories:
 * tech (ICT, Computer Hardware, Data & Digital, Internet, Telecom, Media) plus broad
 * opportunity types (Consultancy, Grant Opportunities, NGO, Business Opp.).
 * Each tender is labelled with its own category so they're distinguishable in the dashboard.
 */

import { DEFAULT_HEADERS, SOURCES } from "./config";
import { buildTenderDict, fetchWithRetry, insertTendersBulk, logScraperRun, parseDate, stripHtml } from "./utils";

const SOURCE = SOURCES.etenders;
const CATEGORY_MAP = SOURCE.categories;
const CATEGORY_IDS = Object.keys(CATEGORY_MAP).map(Number);

/**
 * Pick a readable category name for a post from the categories we scrape.
 * A post can belong to several categories; prefer the first that's in our map.
 */
function resolveCategoryName(postCategories: number[]): string {
  for (const id of postCategories) {
    if (CATEGORY_MAP[id]) return CATEGORY_MAP[id];
  }
  return "Other";
}

interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  link: string;
  categories: number[];
}

async function fetchTenderListings(): Promise<WordPressPost[]> {
  const url = `${SOURCE.url}/wp-json/wp/v2/posts`;
  // WordPress `categories` accepts a comma-separated list = OR across all our categories.
  const params = new URLSearchParams({
    categories: CATEGORY_IDS.join(","),
    per_page: "100",
    orderby: "date",
    order: "desc",
  });

  console.log(`Fetching tenders from ${SOURCE.name} across ${CATEGORY_IDS.length} categories...`);
  const response = await fetchWithRetry(`${url}?${params}`, {
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const posts = (await response.json()) as WordPressPost[];
  console.log(`✓ Fetched ${posts.length} posts from ${SOURCE.name}`);
  return posts;
}

function extractTenders(posts: WordPressPost[]) {
  const tenders: ReturnType<typeof buildTenderDict>[] = [];

  for (const post of posts) {
    try {
      const title = stripHtml(post.title.rendered);
      const description = Array.from(stripHtml(post.excerpt.rendered || post.content.rendered))
        .slice(0, 500)
        .join("");
      const datePublished = parseDate(post.date);
      const link = post.link;

      if (!title || !link) continue;

      const tender = buildTenderDict({
        title,
        source_name: SOURCE.name,
        source_url: link,
        description,
        date_published: datePublished,
        category: resolveCategoryName(post.categories),
        matched_keywords: null, // Pre-filtered by category
      });

      tenders.push(tender);
    } catch (_err) {
      // Skip individual tenders that fail to parse
    }
  }

  return tenders;
}

export async function runEtendersScraper() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Running ${SOURCE.name} scraper...`);
  console.log("=".repeat(80));

  const startTime = Date.now();

  try {
    const posts = await fetchTenderListings();
    if (posts.length === 0) {
      console.log(`No tenders found from ${SOURCE.name}`);
      const result = { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No tenders returned from source",
        elapsed_ms: Date.now() - startTime,
      });
      return result;
    }

    const tenders = extractTenders(posts);
    console.log(`Extracted ${tenders.length} tenders`);

    const inserted = await insertTendersBulk(tenders);

    console.log(`✓ Inserted ${inserted}/${tenders.length} tenders into Supabase`);

    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: tenders.length,
      inserted_count: inserted,
      success: true,
      error_message: null,
      elapsed_ms: Date.now() - startTime,
    });

    return {
      source: SOURCE.name,
      scraped: tenders.length,
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
