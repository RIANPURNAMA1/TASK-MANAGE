/** Minimal CSV export (FR-45). Excel-friendly: UTF-8 BOM, CRLF, quoted cells. */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

function cell(value: string | number): string {
  const text = String(value);
  // Neutralise spreadsheet formulas in user-provided text (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function downloadCsv<T>(fileName: string, rows: T[], columns: CsvColumn<T>[]): void {
  const lines = [columns.map((c) => cell(c.header)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))];
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
