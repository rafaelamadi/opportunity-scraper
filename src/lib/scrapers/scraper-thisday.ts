/**
 * thisdaylive.com scraper
 * Fetches posts from the Business category via WordPress API, then applies our own
 * ICT_KEYWORDS filter — this site has no working procurement/tender category or search
 * (both were verified broken during recon: the "Procurement" tag page and the wp-json
 * `search` param both return generic recent posts, ignoring the filter entirely).
 */

import { DEFAULT_HEADERS, ICT_KEYWORDS, SOURCES } from "./config";
import {
  buildTenderDict,
  fetchWithRetry,
  insertTendersBulk,
  logScraperRun,
  matchKeywords,
  parseDate,
  stripHtml,
} from "./utils";

const SOURCE = SOURCES.thisday;

interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  link: string;
  categories: number[];
}

async function fetchPosts(): Promise<WordPressPost[]> {
  const url = `${SOURCE.url}/wp-json/wp/v2/posts`;
  const params = new URLSearchParams({
    categories: String(SOURCE.category_id),
    per_page: "50",
  });

  console.log(`Fetching Business category posts from ${SOURCE.name}...`);
  const response = await fetchWithRetry(`${url}?${params}`, {
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const posts = (await response.json()) as WordPressPost[];
  console.log(`✓ Fetched ${posts.length} Business posts from ${SOURCE.name}`);
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

      // No pre-built ICT category on this site — filter by keyword ourselves
      const matched = matchKeywords(`${title} ${description}`, ICT_KEYWORDS);
      if (matched.length === 0) continue;

      const tender = buildTenderDict({
        title,
        source_name: SOURCE.name,
        source_url: link,
        description,
        date_published: datePublished,
        category: "Business",
        matched_keywords: matched.join(", "),
      });

      tenders.push(tender);
    } catch (_err) {
      // Skip individual posts that fail to parse
    }
  }

  return tenders;
}

export async function runThisDayScraper() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Running ${SOURCE.name} scraper...`);
  console.log("=".repeat(80));

  const startTime = Date.now();

  try {
    const posts = await fetchPosts();
    if (posts.length === 0) {
      console.log(`No posts found from ${SOURCE.name}`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: false,
        error_message: "No posts returned from source",
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: false };
    }

    const tenders = extractTenders(posts);
    console.log(`Matched ${tenders.length}/${posts.length} posts against ICT keywords`);

    if (tenders.length === 0) {
      console.log(`No ICT-relevant posts found from ${SOURCE.name} in this batch`);
      await logScraperRun({
        source_name: SOURCE.name,
        scraped_count: 0,
        inserted_count: 0,
        success: true, // Not a failure — just no matches this run, which is expected/normal
        error_message: null,
        elapsed_ms: Date.now() - startTime,
      });
      return { source: SOURCE.name, scraped: 0, inserted: 0, success: true };
    }

    const inserted = await insertTendersBulk(tenders);
    const success = inserted > 0;

    console.log(`✓ Inserted ${inserted}/${tenders.length} tenders into Supabase`);

    await logScraperRun({
      source_name: SOURCE.name,
      scraped_count: tenders.length,
      inserted_count: inserted,
      success,
      error_message: success ? null : "No tenders were inserted",
      elapsed_ms: Date.now() - startTime,
    });

    return {
      source: SOURCE.name,
      scraped: tenders.length,
      inserted,
      success,
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
