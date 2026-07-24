/**
 * Translation utility using Groq (free tier, no credit card required).
 *
 * Get a free API key at https://console.groq.com (Google/GitHub/email signup,
 * no card). Free tier is generous and very fast - far more than our volume.
 * Set GROQ_API_KEY in .env.local.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export interface TranslationResult {
  text: string;
  detectedLanguage: string;
}

interface GroqResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Translate a single text to English via Groq.
 * Returns the translated text plus the detected source language code.
 * Returns null if translation is unavailable (no key, API error).
 */
export async function translateToEnglish(text: string): Promise<TranslationResult | null> {
  if (!GROQ_API_KEY) {
    console.warn("GROQ_API_KEY not set - skipping translation");
    return null;
  }

  if (!text || !text.trim()) {
    return { text, detectedLanguage: "EN" };
  }

  // Ask the model to detect language and translate, returning strict JSON so we
  // can parse both pieces reliably. If the text is already English, it says so.
  const systemPrompt = `You are a translation engine. Detect the language of the user's text and translate it to English.
Respond with ONLY a JSON object, no markdown, in this exact shape:
{"detected_language":"<ISO 639-1 code uppercase, e.g. DE, FR, EN>","translation":"<English translation, or the original text verbatim if it is already English>"}`;

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (response.status === 429) {
      // Rate limited - respect Retry-After (Groq sends seconds), then retry once
      const retryAfter = Number(response.headers.get("retry-after")) || 3;
      console.warn(`Rate limited, waiting ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return translateToEnglish(text);
    }

    if (!response.ok) {
      const body = await response.text();
      console.error(`Groq API error ${response.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = (await response.json()) as GroqResponse;
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { detected_language?: string; translation?: string };
    if (!parsed.translation) return null;

    return {
      text: parsed.translation,
      detectedLanguage: (parsed.detected_language || "EN").toUpperCase(),
    };
  } catch (err) {
    console.error("Translation request failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
