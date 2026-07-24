/**
 * Translation batch job.
 *
 * Finds opportunities with no translation yet (detected_language IS NULL),
 * translates title + description to English via DeepL, and writes
 * title_en / description_en / detected_language back to Supabase.
 *
 * Usage: npm run translate
 *
 * Requires:
 * - GROQ_API_KEY in .env.local (free, no card: https://console.groq.com)
 * - SERVICE_ROLE_KEY in .env.local (to update rows past RLS)
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, value] = line.split("=");
    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

import { translateToEnglish } from "../src/lib/scrapers/translate";

const BATCH_LIMIT = 200; // rows to process per run

/**
 * Cheap heuristic: is this text almost certainly already English?
 * If it contains only ASCII letters/punctuation (no accented or non-Latin
 * characters), we treat it as English and skip the translation API call.
 * Genuinely foreign text (German ä/ö/ü/ß, French é/è/à, Arabic, etc.) fails
 * this check and gets sent to the model.
 */
function isLikelyEnglish(text: string): boolean {
  if (!text.trim()) return true;
  // Any character outside the basic ASCII range signals possible non-English
  // eslint-disable-next-line no-control-regex
  return !/[^\x00-\x7F]/.test(text);
}

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  if (!groqKey) {
    console.error("❌ Missing GROQ_API_KEY in .env.local");
    console.error("   Get a free key (no card) at https://console.groq.com");
    process.exit(1);
  }

  console.log("\n🌍 Translation batch job");
  console.log("=".repeat(60));

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch untranslated rows
  const { data: rows, error } = await supabase
    .from("opportunities")
    .select("id, title, description")
    .is("detected_language", null)
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("❌ Failed to fetch opportunities:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("✓ Nothing to translate - all rows already have a detected language.");
    return;
  }

  console.log(`Found ${rows.length} untranslated opportunities\n`);

  let translated = 0;
  let skipped = 0;
  let apiEnglish = 0;

  for (const row of rows) {
    const title = row.title || "";

    // Cheap local pre-check: text that is plain ASCII (no accented/non-Latin
    // characters) is almost certainly already English. Mark it as EN without
    // burning an API call - this keeps us far under Groq's rate limit and only
    // sends genuinely-foreign text (GIZ German/French, etc.) to the model.
    if (isLikelyEnglish(title)) {
      const { error: updateError } = await supabase
        .from("opportunities")
        .update({ title_en: title, detected_language: "EN" })
        .eq("id", row.id);
      if (updateError) {
        console.log(`  ❌ Failed to update #${row.id}: ${updateError.message}`);
        skipped++;
      } else {
        apiEnglish++;
      }
      continue;
    }

    const titleResult = await translateToEnglish(title);

    if (!titleResult) {
      console.log(`  ⚠️  Skipped #${row.id} (translation unavailable)`);
      skipped++;
      continue;
    }

    // Only translate description if the title wasn't English (saves API calls)
    let descriptionEn: string | null = null;
    if (titleResult.detectedLanguage !== "EN" && row.description) {
      const descResult = await translateToEnglish(row.description);
      descriptionEn = descResult?.text || null;
      // Pace description calls too
      await new Promise((r) => setTimeout(r, 2100));
    }

    const { error: updateError } = await supabase
      .from("opportunities")
      .update({
        title_en: titleResult.text,
        description_en: descriptionEn,
        detected_language: titleResult.detectedLanguage,
      })
      .eq("id", row.id);

    if (updateError) {
      console.log(`  ❌ Failed to update #${row.id}: ${updateError.message}`);
      skipped++;
    } else {
      const flag = titleResult.detectedLanguage === "EN" ? "(EN)" : `[${titleResult.detectedLanguage}→EN]`;
      console.log(`  ✓ #${row.id} ${flag} ${titleResult.text.slice(0, 60)}`);
      translated++;
    }

    // Pace requests to stay under Groq's 30 req/min free-tier limit
    await new Promise((r) => setTimeout(r, 2100));
  }

  if (apiEnglish > 0) {
    console.log(`  (${apiEnglish} rows detected as English locally - no API call needed)`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Done. Translated: ${translated}, Skipped: ${skipped}`);
  console.log("=".repeat(60) + "\n");
}

run().catch((err) => {
  console.error("Translation job failed:", err);
  process.exit(1);
});
