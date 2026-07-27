import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, CircleSlash } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { ScrapeStatus } from "@/lib/get-scrape-status";
import { cn } from "@/lib/utils";

interface ScrapeStatusCardProps {
  status: ScrapeStatus;
}

/**
 * At-a-glance "is the daily cron actually running" indicator, since a source
 * showing inserted:0 on the dashboard is normal (no new listings that day) and
 * easy to mistake for the scraper being broken. This surfaces the real signal:
 * when the last run happened, and whether every source in it succeeded.
 */
export function ScrapeStatusCard({ status }: ScrapeStatusCardProps) {
  if (!status) {
    return (
      <Card size="sm" className="shadow-none group-data-[collapsible=icon]:hidden">
        <CardContent className="flex items-center gap-2 px-4 text-muted-foreground text-sm">
          <CircleSlash className="h-4 w-4 shrink-0" />
          <span>No scrape runs recorded yet</span>
        </CardContent>
      </Card>
    );
  }

  const { lastRunAt, successCount, failCount } = status;
  const allSucceeded = failCount === 0;
  const timeAgo = formatDistanceToNow(new Date(lastRunAt), { addSuffix: true });

  return (
    <Card size="sm" className="shadow-none group-data-[collapsible=icon]:hidden">
      <CardContent className="flex items-start gap-2 px-4">
        {allSucceeded ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
        )}
        <div className="min-w-0">
          <p className="text-sm">Last scraped {timeAgo}</p>
          <p className={cn("text-muted-foreground text-xs", !allSucceeded && "text-amber-600 dark:text-amber-500")}>
            {successCount} succeeded{failCount > 0 ? `, ${failCount} failed` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
