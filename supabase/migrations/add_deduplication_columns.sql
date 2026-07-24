-- Add deduplication columns to tender_leads table
-- Run this in Supabase SQL Editor

ALTER TABLE tender_leads
ADD COLUMN IF NOT EXISTS duplicate_group_id TEXT,
ADD COLUMN IF NOT EXISTS canonical_id INT,
ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS duplicate_sources TEXT; -- comma-separated list of other sources with same content

-- Create index on duplicate_group_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_tender_leads_duplicate_group_id
ON tender_leads(duplicate_group_id);

-- Create index on canonical_id for fast duplicate detection
CREATE INDEX IF NOT EXISTS idx_tender_leads_canonical_id
ON tender_leads(canonical_id);

-- Create index on is_duplicate for filtering
CREATE INDEX IF NOT EXISTS idx_tender_leads_is_duplicate
ON tender_leads(is_duplicate);
