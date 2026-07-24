/**
 * Deduplication logic for opportunities
 * Detects opportunities posted on multiple sources and links them together
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

import { SUPABASE_KEY, SUPABASE_URL } from "./scrapers/config";

/**
 * Normalize title for duplicate detection
 * Lowercase, remove special chars, collapse whitespace
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
}

/**
 * Generate hash of normalized title for grouping duplicates
 */
export function generateDuplicateHash(title: string): string {
  const normalized = normalizeTitle(title);
  return crypto.createHash("md5").update(normalized).digest("hex");
}

interface TenderRecord {
  id: number;
  title: string;
  source_name: string;
  duplicate_group_id?: string;
  canonical_id?: number;
  is_duplicate?: boolean;
  duplicate_sources?: string;
}

/**
 * Process all tenders and detect duplicates
 * Should be run after scraping completes
 */
export async function deduplicateTenders(): Promise<{
  duplicates_found: number;
  canonical_records: number;
  updated: number;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    console.log("Starting deduplication process...");

    // Fetch all tenders with dedup columns
    const { data: tenders, error } = await supabase
      .from("opportunities")
      .select("id, title, source_name, duplicate_group_id, canonical_id, is_duplicate");

    if (error) {
      throw new Error(`Failed to fetch tenders: ${error.message}`);
    }

    if (!tenders || tenders.length === 0) {
      console.log("No tenders found to deduplicate");
      return { duplicates_found: 0, canonical_records: 0, updated: 0 };
    }

    // Group by duplicate hash
    const groups = new Map<string, TenderRecord[]>();
    for (const tender of tenders) {
      const hash = generateDuplicateHash(tender.title);
      if (!groups.has(hash)) {
        groups.set(hash, []);
      }
      groups.get(hash)!.push(tender as TenderRecord);
    }

    // Process duplicates
    let duplicatesFound = 0;
    let canonicalCount = 0;
    const updates: Array<{ id: number; data: Partial<TenderRecord> }> = [];

    for (const [hash, group] of groups.entries()) {
      if (group.length === 1) {
        // No duplicates in this group
        // But ensure it has the hash set
        if (!group[0].duplicate_group_id) {
          updates.push({
            id: group[0].id,
            data: {
              duplicate_group_id: hash,
              canonical_id: group[0].id,
              is_duplicate: false,
            },
          });
        }
        continue;
      }

      // Multiple records with same title
      duplicatesFound += group.length - 1;

      // First record (earliest ID) is canonical
      const canonical = group[0];
      canonicalCount++;

      // Mark all as part of this group
      for (let i = 0; i < group.length; i++) {
        const record = group[i];
        const isCanonical = i === 0;
        const otherSources = group
          .filter((_, idx) => idx !== i)
          .map((r) => r.source_name)
          .join(", ");

        updates.push({
          id: record.id,
          data: {
            duplicate_group_id: hash,
            canonical_id: canonical.id,
            is_duplicate: !isCanonical,
            duplicate_sources: isCanonical ? otherSources : undefined,
          },
        });
      }
    }

    // Apply updates in batches
    console.log(`Found ${duplicatesFound} duplicates across ${canonicalCount} groups`);
    console.log(`Updating ${updates.length} records...`);

    let updated = 0;
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);

      // Supabase doesn't support batch upsert easily, so do individual updates
      for (const update of batch) {
        const { error: updateError } = await supabase
          .from("opportunities")
          .update(update.data)
          .eq("id", update.id);

        if (updateError) {
          console.error(`Failed to update tender ${update.id}:`, updateError.message);
        } else {
          updated++;
        }
      }
    }

    console.log(`✓ Deduplication complete. Updated ${updated} records.`);

    return {
      duplicates_found: duplicatesFound,
      canonical_records: canonicalCount,
      updated,
    };
  } catch (err) {
    console.error("Deduplication error:", err);
    throw err;
  }
}

/**
 * Get unique opportunities (excluding duplicates)
 */
export async function getUniqueTenders(sourceFilter?: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    let query = supabase
      .from("opportunities")
      .select("*")
      .eq("is_duplicate", false); // Only canonical records

    if (sourceFilter && sourceFilter !== "all") {
      query = query.eq("source_name", sourceFilter);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch unique tenders: ${error.message}`);
    }

    return data || [];
  } catch (err) {
    console.error("Error fetching unique tenders:", err);
    return [];
  }
}
