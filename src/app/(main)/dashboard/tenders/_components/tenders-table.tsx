"use client";

import Link from "next/link";

import { format } from "date-fns";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tender } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface TendersTableProps {
  tenders: Tender[];
  bookmarkedIds?: Set<number>;
  onToggleBookmark?: (id: number) => void;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
        status === "new" && "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
        status === "old" && "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
        status !== "new" && status !== "old" && "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
      )}
    >
      {status}
    </span>
  );
}

export function TendersTable({ tenders, bookmarkedIds, onToggleBookmark }: TendersTableProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch {
      return "-";
    }
  };

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold min-w-80">Title</TableHead>
            <TableHead className="font-semibold min-w-32">Published</TableHead>
            <TableHead className="font-semibold min-w-32">Deadline</TableHead>
            <TableHead className="font-semibold min-w-32">Category</TableHead>
            {onToggleBookmark && <TableHead className="font-semibold min-w-16 text-center">Saved</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenders.map((tender) => {
            // Show the English translation when we have one for non-English content,
            // keeping the original title visible beneath it so nothing is lost.
            const hasTranslation =
              !!tender.title_en && tender.detected_language !== "EN" && tender.title_en !== tender.title;
            const displayTitle = hasTranslation ? tender.title_en! : tender.title;

            return (
              <TableRow key={tender.id} className="hover:bg-muted/50">
                <TableCell className="max-w-80 whitespace-normal font-medium break-words">
                  <Link
                    href={tender.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:underline"
                  >
                    <div className="flex items-start gap-2">
                      <StatusBadge status={tender.status} />
                      <span className="text-xs sm:text-sm">{displayTitle}</span>
                    </div>
                    {hasTranslation && (
                      <div className="text-muted-foreground mt-1 text-xs italic">
                        {tender.detected_language}: {tender.title}
                      </div>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="text-xs sm:text-sm">{formatDate(tender.date_published)}</TableCell>
                <TableCell className="text-xs sm:text-sm">{formatDate(tender.deadline)}</TableCell>
                <TableCell className="text-xs sm:text-sm">{tender.category || "-"}</TableCell>
                {onToggleBookmark && (
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onToggleBookmark(tender.id)}
                      aria-label={bookmarkedIds?.has(tender.id) ? "Remove bookmark" : "Add bookmark"}
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          bookmarkedIds?.has(tender.id) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
                        )}
                      />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
