-- Bookmarks ("add to cart") table
-- Run this once in the Supabase SQL Editor.
--
-- Modeled on scraper_logs (create_scraper_logs.sql) — the proven anon-write pattern.
-- The dashboard uses the anon key, which can INSERT/SELECT/DELETE under these policies
-- (it cannot UPDATE, so we deliberately use INSERT+DELETE rather than a boolean flag).

create table if not exists bookmarks (
  id bigint generated always as identity primary key,
  opportunity_id bigint not null references opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (opportunity_id)   -- one bookmark per opportunity (single-user era)
);

alter table bookmarks enable row level security;

-- Public API (anon key) can add a bookmark
create policy "Allow public API to insert bookmarks"
  on bookmarks for insert
  with check (true);

-- Anyone can read bookmarks (dashboard shows the cart)
create policy "Allow public read of bookmarks"
  on bookmarks for select
  using (true);

-- Public API (anon key) can remove a bookmark
create policy "Allow public API to delete bookmarks"
  on bookmarks for delete
  using (true);

create index if not exists bookmarks_opportunity_id_idx
  on bookmarks(opportunity_id);

-- Future multi-user upgrade (not now): add `user_id`, change the unique constraint to
-- (opportunity_id, user_id), and scope the policies/queries by user. Additive, no rebuild.
