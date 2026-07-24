-- Rename tender_leads table to opportunities
-- Add opportunity_type field to support diverse opportunity sources

-- Rename table
ALTER TABLE tender_leads RENAME TO opportunities;

-- Rename all related indexes
ALTER INDEX IF EXISTS idx_tender_leads_duplicate_group_id RENAME TO idx_opportunities_duplicate_group_id;
ALTER INDEX IF EXISTS idx_tender_leads_canonical_id RENAME TO idx_opportunities_canonical_id;
ALTER INDEX IF EXISTS idx_tender_leads_is_duplicate RENAME TO idx_opportunities_is_duplicate;

-- Add opportunity_type column if not exists
-- Types: "tender", "job", "grant", "partnership", "contract", "call_for_application", "news", "business_innovation", etc.
ALTER TABLE opportunities
ADD COLUMN IF NOT EXISTS opportunity_type TEXT DEFAULT 'tender';

-- Create index on opportunity_type for filtering
CREATE INDEX IF NOT EXISTS idx_opportunities_opportunity_type
ON opportunities(opportunity_type);

-- Create composite index for common queries (source + type)
CREATE INDEX IF NOT EXISTS idx_opportunities_source_type
ON opportunities(source_name, opportunity_type);
