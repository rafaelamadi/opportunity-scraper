/**
 * Cron job endpoint for running all scrapers
 * Triggered by Vercel cron at 2:00 AM UTC daily
 *
 * Usage:
 * - Called automatically by Vercel cron (with CRON_SECRET header)
 * - Can be manually tested with: curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite/api/cron/run-scrapers
 */

import { type NextRequest, NextResponse } from "next/server";

import { deduplicateTenders } from "@/lib/deduplication";
import { listScrapers, runAllScrapers } from "@/lib/scrapers/registry";

// Safety margin as more sources get added — a real run currently takes ~37s across
// 14 active sources (measured 2026-07-24). Vercel Hobby caps at 60s regardless of
// this value, so this just makes the ceiling explicit rather than relying on the
// (lower) framework default.
export const maxDuration = 60;

// Verify the cron secret to prevent unauthorized calls
function verifyCronSecret(request: NextRequest): boolean {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET environment variable not set");
    return false;
  }

  return secret === cronSecret;
}

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel's cron service
  if (!verifyCronSecret(request)) {
    console.warn("Unauthorized cron request attempted");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const startTime = Date.now();
    console.log("\n🚀 Cron job started at", new Date().toISOString());
    console.log(`Running ${listScrapers().length} scrapers`);

    const results = await runAllScrapers();

    // Run deduplication after all scrapers complete
    console.log("\nRunning deduplication...");
    const dedupStats = await deduplicateTenders();

    const elapsedMs = Date.now() - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(2);

    // Calculate summary
    const summary = {
      timestamp: new Date().toISOString(),
      total_scrapers: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      total_scraped: results.reduce((sum, r) => sum + r.scraped, 0),
      total_inserted: results.reduce((sum, r) => sum + r.inserted, 0),
      deduplication: dedupStats,
      elapsed_seconds: parseFloat(elapsedSec),
      details: results,
    };

    console.log("\n" + "=".repeat(80));
    console.log("CRON JOB SUMMARY");
    console.log("=".repeat(80));
    console.log(`Elapsed time: ${elapsedSec}s`);
    console.log(`Successful: ${summary.successful}/${results.length}`);
    console.log(`Total tenders: ${summary.total_scraped}`);
    console.log(`Total inserted: ${summary.total_inserted}`);
    console.log(`Duplicates found: ${dedupStats.duplicates_found}`);
    console.log(`Canonical records: ${dedupStats.canonical_records}`);
    console.log(`Dedup records updated: ${dedupStats.updated}`);
    console.log("=".repeat(80) + "\n");

    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    console.error("Cron job error:", err);
    return NextResponse.json(
      {
        error: "Cron job failed",
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * POST endpoint for manual triggering (for testing)
 * Usage: curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://yoursite/api/cron/run-scrapers
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same logic as GET
  return GET(request);
}
