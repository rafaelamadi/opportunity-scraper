import { supabase } from "./supabase";

export async function getSourcesFromDB(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from("opportunities").select("source_name");

    if (error) {
      console.error("Error fetching sources:", error);
      return [];
    }

    // Get unique source names
    const uniqueSources = Array.from(new Set(data?.map((row) => row.source_name) || [])).sort();

    return uniqueSources as string[];
  } catch (err) {
    console.error("Failed to fetch sources:", err);
    return [];
  }
}
