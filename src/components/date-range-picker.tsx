"use client";

import * as React from "react";

import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (value: DateRange | undefined) => void;
  /**
   * When true, this is a controlled component with no uncontrolled fallback —
   * an undefined `value` means "no range selected" (shows placeholder text),
   * not "default to the last 29 days". Existing uncontrolled usages are
   * unaffected since they never pass `value={undefined}` in the first place.
   */
  controlled?: boolean;
  placeholder?: string;
}

export function DateRangePicker({
  value,
  onChange,
  controlled = false,
  placeholder = "Select date",
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internalDateRange, setInternalDateRange] = React.useState<DateRange | undefined>(() => {
    if (controlled) return undefined;
    const to = new Date();
    const from = subDays(to, 29);
    return { from, to };
  });
  const dateRange = controlled ? value : (value ?? internalDateRange);
  let dateRangeLabel = placeholder;

  if (dateRange?.from) {
    dateRangeLabel = format(dateRange.from, "d MMM yyyy");
  }

  if (dateRange?.from && dateRange.to) {
    dateRangeLabel = `${format(dateRange.from, "d MMM yyyy")} - ${format(dateRange.to, "d MMM yyyy")}`;
  }

  const handleDateChange = (nextValue: DateRange | undefined) => {
    if (!controlled && !value) {
      setInternalDateRange(nextValue);
    }
    onChange?.(nextValue);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" id="date" className="font-normal">
          {dateRangeLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="end">
        <Calendar
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={handleDateChange}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
