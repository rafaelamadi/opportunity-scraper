import { listActiveSourceNames } from "./scrapers/registry";
import { supabase } from "./supabase";

/**
 * Distinct source_names in the opportunities table, filtered to only sources
 * that are still actively scraped. Disabled sources (see TODO.md) keep their
 * historical rows in the database — this just keeps them out of the sidebar
 * and source filters, rather than deleting the data.
 */
export async function getSourcesFromDB(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from("opportunities").select("source_name");

    if (error) {
      console.error("Error fetching sources:", error);
      return [];
    }

    const activeSourceNames = new Set(listActiveSourceNames());
    const uniqueSources = Array.from(new Set(data?.map((row) => row.source_name) || []))
      .filter((source) => activeSourceNames.has(source))
      .sort();

    return uniqueSources as string[];
  } catch (err) {
    console.error("Failed to fetch sources:", err);
    return [];
  }
}
