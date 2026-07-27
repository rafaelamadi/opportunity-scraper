import { supabase } from "./supabase";

export type ScrapeStatus = {
  lastRunAt: string;
  successCount: number;
  failCount: number;
} | null;

/**
 * Summary of the most recent cron run, for an at-a-glance "is scraping actually
 * happening" indicator. Groups by run_at rather than trusting a single row,
 * since one cron invocation writes one scraper_logs row per source within a
 * few seconds of each other (see src/lib/scrapers/registry.ts).
 */
export async function getLastScrapeStatus(): Promise<ScrapeStatus> {
  try {
    const { data, error } = await supabase
      .from("scraper_logs")
      .select("run_at, success")
      .order("run_at", { ascending: false })
      .limit(30);

    if (error || !data || data.length === 0) {
      return null;
    }

    // The most recent run's rows all land within seconds of each other. Treat
    // anything within 5 minutes of the newest row as "the same run".
    const latestRunAt = new Date(data[0].run_at).getTime();
    const sameRun = data.filter((row) => latestRunAt - new Date(row.run_at).getTime() < 5 * 60 * 1000);

    return {
      lastRunAt: data[0].run_at,
      successCount: sameRun.filter((r) => r.success).length,
      failCount: sameRun.filter((r) => !r.success).length,
    };
  } catch (err) {
    console.error("Failed to fetch scrape status:", err);
    return null;
  }
}
