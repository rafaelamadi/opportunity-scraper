/**
 * Export bookmarked opportunities to CSV or Excel (.xlsx).
 *
 * Both formats share one column definition so they always contain identical data.
 * Browser-only — no backend. A future "email these" feature can reuse the same
 * row-mapping in a server route.
 */

import * as XLSX from "xlsx";

import type { Opportunity } from "./supabase";

// Shared column definition: [header, accessor]. Order = column order in the file.
const COLUMNS: { header: string; get: (o: Opportunity) => string }[] = [
  { header: "Title", get: (o) => o.title ?? "" },
  { header: "Title (EN)", get: (o) => o.title_en ?? "" },
  { header: "Source", get: (o) => o.source_name ?? "" },
  { header: "Category", get: (o) => o.category ?? "" },
  { header: "Type", get: (o) => o.opportunity_type ?? "" },
  { header: "Published", get: (o) => o.date_published ?? "" },
  { header: "Deadline", get: (o) => o.deadline ?? "" },
  { header: "Link", get: (o) => o.source_url ?? "" },
];

function timestampedName(ext: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `bookmarks-${date}.${ext}`;
}

/** Build an array-of-rows (header row first) shared by both exporters. */
function toRows(opportunities: Opportunity[]): string[][] {
  const header = COLUMNS.map((c) => c.header);
  const body = opportunities.map((o) => COLUMNS.map((c) => c.get(o)));
  return [header, ...body];
}

/** Escape a single CSV field per RFC 4180 (quote if it contains comma/quote/newline). */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportCsv(opportunities: Opportunity[]): void {
  const rows = toRows(opportunities);
  const csv = rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
  // Prepend a BOM so Excel opens UTF-8 (accented French/German text) correctly.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, timestampedName("csv"));
}

export function exportExcel(opportunities: Opportunity[]): void {
  const rows = toRows(opportunities);
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Bookmarks");
  XLSX.writeFile(workbook, timestampedName("xlsx"));
}
