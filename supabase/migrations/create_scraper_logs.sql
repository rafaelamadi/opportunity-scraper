-- Run this in Supabase SQL Editor to create the scraper_logs table

create table if not exists scraper_logs (
  id bigint generated always as identity primary key,
  source_name text not null,
  run_at timestamptz not null default now(),
  scraped_count integer not null default 0,
  inserted_count integer not null default 0,
  success boolean not null default false,
  error_message text,
  elapsed_ms integer
);

alter table scraper_logs enable row level security;

-- Public API can insert logs (same trust model as tender_leads inserts)
create policy "Allow public API to insert scraper logs"
  on scraper_logs for insert
  with check (true);

-- Anyone can read logs (dashboard will show scraper health)
create policy "Allow public read of scraper logs"
  on scraper_logs for select
  using (true);

create index if not exists scraper_logs_source_run_at_idx
  on scraper_logs (source_name, run_at desc);
