"use client";

import { useEffect, useState } from "react";

import { useSearchParams } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase, type Opportunity } from "@/lib/supabase";

import { TendersTable } from "./_components/tenders-table";

export default function TendersPage() {
  const searchParams = useSearchParams();
  const source = searchParams.get("source");

  const [tenders, setTenders] = useState<Opportunity[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        let query = supabase
          .from("opportunities")
          .select("*")
          .order("date_published", { ascending: false });

        if (source && source !== "all") {
          query = query.eq("source_name", source);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        // Client-side deduplication: keep first occurrence of each unique title
        const seen = new Set<string>();
        const uniqueTenders = (data || []).filter((tender) => {
          const titleLower = tender.title.toLowerCase().replace(/[^\w\s]/g, "").trim();
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
  }, [source]);

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2">{tenders.length} tender(s) found</p>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          <p className="font-semibold">Error loading tenders</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {tenders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No tenders found</p>
        </div>
      ) : (
        <TendersTable
          tenders={tenders}
          bookmarkedIds={bookmarkedIds}
          onToggleBookmark={handleToggleBookmark}
        />
      )}
    </div>
  );
}
