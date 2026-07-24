/**
 * Shared utility functions for all scrapers
 */

import { createClient } from "@supabase/supabase-js";

import { INSERT_DELAY, SUPABASE_KEY, SUPABASE_URL } from "./config";

export function stripHtml(html: string): string {
  if (!html) return "";
  // Simple regex-based HTML stripping
  return html.replace(/<[^>]*>/g, "").trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check title/description against a keyword list (case-insensitive, whole-word match).
 * Used for sources with no pre-built ICT category, where we must filter ourselves
 * instead of trusting the site's own categorization.
 *
 * Uses word-boundary matching, not plain substring — a naive `.includes("app")` also
 * matches inside "happen" or "capable", and `.includes("api")` matches inside "capital".
 * Multi-word keywords (e.g. "e-government") still match as a substring since \b doesn't
 * apply cleanly around hyphens/spaces, but single ambiguous words need the boundary.
 */
export function matchKeywords(text: string, keywords: readonly string[]): string[] {
  return keywords.filter((keyword) => {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
    return pattern.test(text);
  });
}

/**
 * Parse date string to ISO format (YYYY-MM-DD)
 */
export function parseDate(dateStr: string, _dateFormat = "%b %d, %Y"): string | null {
  if (!dateStr) return null;

  try {
    // Handle common Nigerian date formats
    // "Jul 21, 2026" or "21 Jul 2026" or "18 Aug 2026"

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

export interface OpportunityData {
  title: string;
  source_name: string;
  source_url: string;
  description?: string | null;
  date_published?: string | null;
  deadline?: string | null;
  category?: string | null;
  matched_keywords?: string | null;
  opportunity_type?: string; // "tender", "job", "grant", "partnership", etc. Defaults to "tender"
}

/**
 * Build an opportunity object with all required fields
 */
function sanitizeString(str: string | null | undefined): string | null {
  if (!str) return null;
  // Remove null bytes and lone surrogate halves (both break JSON/UTF-8 encoding)
  const cleaned = str
    .replace(/\0/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .trim();
  return cleaned || null;
}

export function buildOpportunityDict(opportunity: OpportunityData) {
  return {
    title: sanitizeString(opportunity.title) || "No title",
    description: sanitizeString(opportunity.description),
    source_name: opportunity.source_name,
    source_url: opportunity.source_url,
    date_published: opportunity.date_published || null,
    deadline: opportunity.deadline || null,
    category: sanitizeString(opportunity.category),
    matched_keywords: sanitizeString(opportunity.matched_keywords),
    opportunity_type: opportunity.opportunity_type || "tender",
    date_scraped: new Date().toISOString().split("T")[0],
    status: "new",
  };
}

// Legacy alias for backwards compatibility
export function buildTenderDict(tender: OpportunityData) {
  return buildOpportunityDict(tender);
}

/**
 * Insert a single opportunity into Supabase
 * Checks if URL already exists to avoid duplicates
 */
export async function insertOpportunityToSupabase(opportunity: ReturnType<typeof buildOpportunityDict>): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Check if this URL already exists
    const { data: existing } = await supabase
      .from("opportunities")
      .select("id")
      .eq("source_url", opportunity.source_url)
      .limit(1);

    if (existing && existing.length > 0) {
      // URL already in database, skip
      return false;
    }

    const { error } = await supabase.from("opportunities").insert([opportunity]);

    if (error) {
      console.error(`Error inserting opportunity "${opportunity.title}":`, error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Insert error:", err);
    return false;
  }
}

/**
 * Insert multiple opportunities with delay between each insert
 */
export async function insertOpportunitiesBulk(
  opportunities: ReturnType<typeof buildOpportunityDict>[],
  delayMs: number = INSERT_DELAY,
): Promise<number> {
  let inserted = 0;

  for (const opportunity of opportunities) {
    const success = await insertOpportunityToSupabase(opportunity);
    if (success) {
      inserted++;
    }
    // Add delay between inserts to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return inserted;
}

// Legacy aliases for backwards compatibility
export async function insertTenderToSupabase(tender: ReturnType<typeof buildTenderDict>): Promise<boolean> {
  return insertOpportunityToSupabase(tender);
}

export async function insertTendersBulk(
  tenders: ReturnType<typeof buildTenderDict>[],
  delayMs?: number,
): Promise<number> {
  return insertOpportunitiesBulk(tenders, delayMs);
}

/**
 * Sleep for a specified number of milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff on rate-limit/server errors (429, 503).
 * Does NOT retry on 4xx client errors other than 429 (those won't fix themselves).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { retries?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const { retries = 3, baseDelayMs = 1000 } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.status === 429 || response.status === 503) {
        if (attempt < retries) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
          const backoffMs = retryAfterMs ?? baseDelayMs * 2 ** attempt;
          console.warn(
            `Rate limited (${response.status}) fetching ${url}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries})`,
          );
          await sleep(backoffMs);
          continue;
        }
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const backoffMs = baseDelayMs * 2 ** attempt;
        console.warn(`Fetch error for ${url}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries}):`, err);
        await sleep(backoffMs);
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${retries} retries`);
}

export interface ScraperLogEntry {
  source_name: string;
  scraped_count: number;
  inserted_count: number;
  success: boolean;
  error_message?: string | null;
  elapsed_ms?: number;
}

/**
 * Record a scraper run to the scraper_logs table for monitoring.
 * Failures to log are swallowed (logging must never break the scraper itself).
 */
export async function logScraperRun(entry: ScraperLogEntry): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error } = await supabase.from("scraper_logs").insert([
      {
        source_name: entry.source_name,
        scraped_count: entry.scraped_count,
        inserted_count: entry.inserted_count,
        success: entry.success,
        error_message: entry.error_message ?? null,
        elapsed_ms: entry.elapsed_ms ?? null,
      },
    ]);

    if (error) {
      console.error(`Failed to write scraper log for ${entry.source_name}:`, error.message);
    }
  } catch (err) {
    console.error(`Failed to write scraper log for ${entry.source_name}:`, err);
  }
}
