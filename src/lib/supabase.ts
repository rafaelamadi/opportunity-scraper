import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export type Opportunity = {
  id: number;
  title: string;
  description: string | null;
  source_name: string;
  source_url: string;
  date_published: string | null;
  deadline: string | null;
  category: string | null;
  matched_keywords: string | null;
  opportunity_type: string; // "tender", "job", "grant", "partnership", "contract", "call_for_application", etc.
  title_en: string | null; // English translation of title (null until translation job runs)
  description_en: string | null; // English translation of description
  detected_language: string | null; // source language code, e.g. "EN", "DE", "FR"
  date_scraped: string;
  status: string;
  created_at: string;
  updated_at: string;
};

// Legacy alias for backwards compatibility during migration
export type Tender = Opportunity;

export type Bookmark = {
  id: number;
  opportunity_id: number;
  created_at: string;
};
