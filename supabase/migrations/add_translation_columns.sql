-- Add translation columns to opportunities table
-- Stores English translations of non-English titles/descriptions (e.g. GIZ German/French tenders)

ALTER TABLE opportunities
ADD COLUMN IF NOT EXISTS title_en TEXT,
ADD COLUMN IF NOT EXISTS description_en TEXT,
ADD COLUMN IF NOT EXISTS detected_language TEXT; -- source language code (e.g. "DE", "FR", "EN")

-- Index for filtering untranslated records (translation batch job targets these)
CREATE INDEX IF NOT EXISTS idx_opportunities_needs_translation
ON opportunities(detected_language)
WHERE detected_language IS NULL;
