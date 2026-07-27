"use client";

import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import type { DateRange } from "react-day-picker";

import { Skeleton } from "@/components/ui/skeleton";
import { type Opportunity, supabase } from "@/lib/supabase";

import { ALL_CATEGORIES, TendersFilters } from "./_components/tenders-filters";
import { TendersPagination } from "./_components/tenders-pagination";
import { TendersTable } from "./_components/tenders-table";

const DEFAULT_PAGE_SIZE = 25;

export default function TendersPage() {
  const searchParams = useSearchParams();
  const source = searchParams.get("source");

  const [tenders, setTenders] = useState<Opportunity[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    const fetchBookmarks = async () => {
      const { data } = await supabase.from("bookmarks").select("opportunity_id");
      setBookmarkedIds(new Set((data || []).map((b) => b.opportunity_id)));
    };
    fetchBookmarks();
  }, []);

  // Add/remove a bookmark, updating the UI optimistically and reverting on error.
  const handleToggleBookmark = async (id: number) => {
    const isBookmarked = bookmarkedIds.has(id);
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (isBookmarked) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    const { error: mutError } = isBookmarked
      ? await supabase.from("bookmarks").delete().eq("opportunity_id", id)
      : await supabase.from("bookmarks").insert({ opportunity_id: id });

    if (mutError) {
      // Revert on failure
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (isBookmarked) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
      console.error("Failed to toggle bookmark:", mutError.message);
    }
  };

  useEffect(() => {
    const fetchTenders = async () => {
      try {
        setLoading(true);
        setError(null);

        let query = supabase.from("opportunities").select("*");

        if (source && source !== "all") {
          query = query.eq("source_name", source);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        // Sort newest-first by date_published, falling back to created_at for
        // sources that don't reliably have a published date (several sources
        // have 0% date_published fill — sorting by a mostly-null column gives
        // an effectively arbitrary order, scrambling today's inserts in with
        // much older rows instead of showing them at the top). This must run
        // BEFORE dedup below, so dedup keeps each title's newest row rather
        // than whichever occurrence happened to come first in an unordered
        // fetch (that previously made "old"/"new" status look almost random
        // for sources that re-scrape the same title day after day).
        const sorted = [...(data || [])].sort((a, b) => {
          const aDate = a.date_published ? new Date(a.date_published) : new Date(a.created_at);
          const bDate = b.date_published ? new Date(b.date_published) : new Date(b.created_at);
          return bDate.getTime() - aDate.getTime();
        });

        // Client-side deduplication: keep first (= newest, after the sort above)
        // occurrence of each unique title.
        const seen = new Set<string>();
        const uniqueTenders = sorted.filter((tender) => {
          const titleLower = tender.title
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .trim();
          if (seen.has(titleLower)) {
            return false;
          }
          seen.add(titleLower);
          return true;
        });

        setTenders(uniqueTenders);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch tenders");
        console.error("Error fetching tenders:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTenders();
    // Reset filters when switching sources — a category picked on one source
    // may not exist on another. Also reset to page 1, since the previous
    // page may not exist in the new source's result set.
    setCategory(ALL_CATEGORIES);
    setDateRange(undefined);
    setPage(1);
  }, [source]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tenders) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set).sort();
  }, [tenders]);

  const filteredTenders = useMemo(() => {
    return tenders.filter((t) => {
      if (category !== ALL_CATEGORIES && t.category !== category) return false;

      if (dateRange?.from) {
        if (!t.date_published) return false;
        const published = new Date(t.date_published);
        if (published < dateRange.from) return false;
        // Date-only comparison on the upper bound: treat "to" as end-of-day so a
        // range like "today - today" still includes items published today.
        if (dateRange.to) {
          const endOfTo = new Date(dateRange.to);
          endOfTo.setHours(23, 59, 59, 999);
          if (published > endOfTo) return false;
        }
      }

      return true;
    });
  }, [tenders, category, dateRange]);

  // Narrowing the filters can leave the current page out of range (e.g. page 4
  // of an unfiltered list may not exist once a category filter is applied) —
  // reset to page 1 whenever category or the date range change. (The linter's
  // exhaustive-deps check flags category/dateRange as "unnecessary" since the
  // effect body doesn't read them directly — but reacting to the change is
  // the entire point here, so they're intentionally kept.)
  // biome-ignore lint/correctness/useExhaustiveDependencies: category/dateRange are intentionally watched, not read
  useEffect(() => {
    setPage(1);
  }, [category, dateRange]);

  const pageCount = Math.max(Math.ceil(filteredTenders.length / pageSize), 1);
  const currentPage = Math.min(page, pageCount);
  const paginatedTenders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTenders.slice(start, start + pageSize);
  }, [filteredTenders, currentPage, pageSize]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="rounded-lg border">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  const title = source && source !== "all" ? `Tenders from ${source}` : "All Tenders";

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2">{filteredTenders.length} tender(s) found</p>
        </div>

        <TendersFilters
          categories={categories}
          category={category}
          onCategoryChange={setCategory}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          <p className="font-semibold">Error loading tenders</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {tenders.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No tenders found</p>
        </div>
      )}

      {tenders.length > 0 && filteredTenders.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No tenders match the current filters</p>
        </div>
      )}

      {filteredTenders.length > 0 && (
        <>
          <TendersTable
            tenders={paginatedTenders}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={handleToggleBookmark}
          />
          <TendersPagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={filteredTenders.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
