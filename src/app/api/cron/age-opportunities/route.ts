/**
 * Daily cron job to age opportunities
 * Marks opportunities scraped yesterday as "old"
 * Runs after scraping completes (e.g., 3 AM UTC)
 */

import { createClient } from "@supabase/supabase-js";

// Safety margin — this job is a single bulk UPDATE and normally finishes in well
// under a second, but Vercel Hobby caps at 60s regardless of this value.
export const maxDuration = 60;

const cronSecret = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log("\n🕐 Aging opportunities...");

    // Get today's date (UTC)
    const today = new Date().toISOString().split("T")[0];

    console.log(`Today: ${today}`);

    // Mark all opportunities scraped before today as "old"
    // Use date_scraped (when we first found the opportunity)
    const { data: updateData, error: updateError } = await supabase
      .from("opportunities")
      .update({ status: "old" })
      .lt("date_scraped", today)
      .eq("status", "new")
      .select("id");

    if (updateError) {
      console.error("Error aging opportunities:", updateError);
      throw new Error(updateError.message);
    }

    const updatedCount = updateData?.length || 0;
    console.log(`✓ Marked ${updatedCount} opportunities as "old"`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Aged ${updatedCount} opportunities`,
        aged: updatedCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Failed to age opportunities:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
