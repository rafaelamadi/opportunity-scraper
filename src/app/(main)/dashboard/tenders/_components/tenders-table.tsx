"use client";

import Link from "next/link";

import { format } from "date-fns";
import { ExternalLink, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Tender } from "@/lib/supabase";

interface TendersTableProps {
  tenders: Tender[];
  bookmarkedIds?: Set<number>;
  onToggleBookmark?: (id: number) => void;
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
            <TableHead className="font-semibold min-w-32">Category</TableHead>
            <TableHead className="font-semibold min-w-32">Published</TableHead>
            <TableHead className="font-semibold min-w-32">Deadline</TableHead>
            <TableHead className="font-semibold min-w-20">Status</TableHead>
            {onToggleBookmark && <TableHead className="font-semibold min-w-16 text-center">Saved</TableHead>}
            <TableHead className="font-semibold text-right min-w-20">Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenders.map((tender) => {
            // Show the English translation when we have one for non-English content,
            // keeping the original title visible beneath it so nothing is lost.
            const hasTranslation =
              !!tender.title_en &&
              tender.detected_language !== "EN" &&
              tender.title_en !== tender.title;
            const displayTitle = hasTranslation ? tender.title_en! : tender.title;

            return (
            <TableRow key={tender.id} className="hover:bg-muted/50">
              <TableCell className="font-medium text-sm max-w-80">
                <div className="line-clamp-2" title={displayTitle}>
                  {displayTitle}
                </div>
                {hasTranslation && (
                  <div
                    className="text-muted-foreground mt-1 line-clamp-1 text-xs italic"
                    title={tender.title}
                  >
                    {tender.detected_language}: {tender.title}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-sm">{tender.category || "-"}</TableCell>
              <TableCell className="text-sm">{formatDate(tender.date_published)}</TableCell>
              <TableCell className="text-sm">{formatDate(tender.deadline)}</TableCell>
              <TableCell className="text-sm">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    tender.status === "new"
                      ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : tender.status === "old"
                      ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                  }`}
                >
                  {tender.status}
                </span>
              </TableCell>
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
                        bookmarkedIds?.has(tender.id)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground",
                      )}
                    />
                  </Button>
                </TableCell>
              )}
              <TableCell className="text-right">
                <Button asChild size="sm" variant="ghost">
                  <Link href={tender.source_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
