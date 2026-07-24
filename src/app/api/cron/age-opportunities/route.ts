/**
 * Daily cron job to age opportunities
 * Marks opportunities scraped yesterday as "old"
 * Runs after scraping completes (e.g., 3 AM UTC)
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
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
      .eq("status", "new");

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
