import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log("Cleaning up duplicate URLs in opportunities table...");

  // Get all opportunities grouped by URL
  const { data } = await supabase
    .from("opportunities")
    .select("id, source_url, date_scraped")
    .order("source_url");

  const byUrl = new Map<string, Array<{ id: number; date_scraped: string }>>();
  data?.forEach((o: any) => {
    if (!byUrl.has(o.source_url)) {
      byUrl.set(o.source_url, []);
    }
    byUrl.get(o.source_url)!.push({ id: o.id, date_scraped: o.date_scraped });
  });

  // Find duplicates: keep oldest, delete newer ones
  const idsToDelete: number[] = [];
  for (const [url, entries] of byUrl) {
    if (entries.length > 1) {
      // Sort by date_scraped ascending (oldest first)
      entries.sort((a, b) => {
        const dateA = new Date(a.date_scraped).getTime();
        const dateB = new Date(b.date_scraped).getTime();
        return dateA - dateB;
      });

      console.log(`URL ${url.substring(0, 60)}: ${entries.length} entries, keeping oldest`);

      // Keep first (oldest), delete rest
      for (let i = 1; i < entries.length; i++) {
        idsToDelete.push(entries[i].id);
      }
    }
  }

  console.log("\nFound", idsToDelete.length, "duplicate entries to delete");

  if (idsToDelete.length === 0) {
    console.log("No duplicates to clean up");
    process.exit(0);
  }

  // Delete duplicates in batches
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += 100) {
    const batch = idsToDelete.slice(i, i + 100);
    const { error } = await supabase
      .from("opportunities")
      .delete()
      .in("id", batch);

    if (error) {
      console.error("Error deleting batch:", error);
    } else {
      deleted += batch.length;
      console.log(`Deleted batch of ${batch.length} (total: ${deleted})`);
    }
  }

  console.log("\n✅ Cleanup complete - deleted", deleted, "duplicate entries");
  process.exit(0);
})().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
