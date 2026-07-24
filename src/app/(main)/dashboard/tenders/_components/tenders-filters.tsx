"use client";

import { X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_CATEGORIES = "all";

interface TendersFiltersProps {
  categories: string[];
  category: string;
  onCategoryChange: (value: string) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (value: DateRange | undefined) => void;
}

/**
 * Category + published-date filters shared by the "All Sources" and individual
 * source tender pages. Filters by date_published, not deadline — most sources
 * don't reliably have a deadline (see documentations/TODO.md), but every row has
 * a scraped/published date.
 */
export function TendersFilters({
  categories,
  category,
  onCategoryChange,
  dateRange,
  onDateRangeChange,
}: TendersFiltersProps) {
  const hasActiveFilters = category !== ALL_CATEGORIES || dateRange?.from !== undefined;

  const clearFilters = () => {
    onCategoryChange(ALL_CATEGORIES);
    onDateRangeChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.length > 0 && (
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <DateRangePicker value={dateRange} onChange={onDateRangeChange} controlled placeholder="All dates" />

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" />
          Clear filters
        </Button>
      )}
    </div>
  );
}

export { ALL_CATEGORIES };
