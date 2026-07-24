"use client";

import { useEffect, useState } from "react";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { exportCsv, exportExcel } from "@/lib/export-opportunities";
import { supabase, type Opportunity } from "@/lib/supabase";

import { TendersTable } from "../tenders/_components/tenders-table";

export default function BookmarksPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBookmarked = async () => {
      try {
        setLoading(true);
        setError(null);

        // Join bookmarks -> opportunities via the FK, newest bookmark first.
        const { data, error: fetchError } = await supabase
          .from("bookmarks")
          .select("opportunity_id, created_at, opportunities(*)")
          .order("created_at", { ascending: false });

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        const rows = (data || [])
          .map((b) => b.opportunities as unknown as Opportunity | null)
          .filter((o): o is Opportunity => o !== null);

        setOpportunities(rows);
        setBookmarkedIds(new Set(rows.map((o) => o.id)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch bookmarks");
        console.error("Error fetching bookmarks:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBookmarked();
  }, []);

  // Removing from the cart deletes the bookmark and drops the row from the list.
  const handleToggleBookmark = async (id: number) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setOpportunities((prev) => prev.filter((o) => o.id !== id));

    const { error: delError } = await supabase.from("bookmarks").delete().eq("opportunity_id", id);
    if (delError) {
      console.error("Failed to remove bookmark:", delError.message);
    }
  };

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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Bookmarks</h1>
          <p className="text-muted-foreground mt-2">{opportunities.length} bookmarked opportunity(ies)</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={opportunities.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportCsv(opportunities)}>CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportExcel(opportunities)}>Excel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          <p className="font-semibold">Error loading bookmarks</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {opportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No bookmarks yet. Star opportunities on a source page to add them here.
          </p>
        </div>
      ) : (
        <TendersTable
          tenders={opportunities}
          bookmarkedIds={bookmarkedIds}
          onToggleBookmark={handleToggleBookmark}
        />
      )}
    </div>
  );
}
