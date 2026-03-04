/**
 * Professional DataTable Component
 * Sablier-quality table with sorting, filtering, and CSV export
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Upload, Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  enableSearch?: boolean;
  enableExport?: boolean;
  enableImport?: boolean;
  onImport?: (data: any[]) => void;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  enableSearch = true,
  enableExport = true,
  enableImport = false,
  onImport,
  emptyMessage = 'No data found',
  className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    const headers = columns.map(col => col.label);
    const rows = filteredAndSortedData.map(row =>
      columns.map(col => {
        const value = row[col.key];
        return value?.toString() || '';
      })
    );

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `export-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      const importedData = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = values[index];
        });
        return obj;
      }).filter(obj => Object.keys(obj).length > 0);

      if (onImport) {
        onImport(importedData);
      }
    };
    reader.readAsText(file);
  };

  // Filter data based on search
  const filteredData = searchQuery
    ? data.filter(row =>
        columns.some(col => {
          const value = row[col.key];
          return value?.toString().toLowerCase().includes(searchQuery.toLowerCase());
        })
      )
    : data;

  // Sort filtered data
  const filteredAndSortedData = sortKey
    ? [...filteredData].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        return sortDirection === 'asc'
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      })
    : filteredData;

  const primaryColumn = columns[0];
  const secondaryColumns = columns.slice(1);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4">
        {enableSearch && (
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-10"
            />
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          {enableExport && data.length > 0 && (
            <Button
              variant="outline"
              onClick={handleExport}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}

          {enableImport && onImport && (
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg font-sans text-sm font-medium text-textPrimary hover:bg-surfaceAlt transition-colors">
                <Upload className="w-4 h-4" />
                Import CSV
              </span>
              <input
                type="file"
                accept=".csv"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Mobile & Tablet: Card View */}
      <div className="lg:hidden space-y-3">
        {filteredAndSortedData.length === 0 ? (
          <div className="text-center py-12 border border-border rounded-lg">
            <p className="text-textMuted font-sans">{emptyMessage}</p>
          </div>
        ) : (
          filteredAndSortedData.map((row, index) => (
            <div
              key={index}
              onClick={() => onRowClick?.(row)}
              className={`bg-surface border border-border rounded-lg p-4 space-y-2 ${
                onRowClick ? 'cursor-pointer hover:border-accent active:bg-surfaceAlt' : ''
              }`}
            >
              {primaryColumn && (
                <div className="pb-3 border-b border-border/70">
                  <span className="mb-2 block text-[11px] font-mono uppercase tracking-wider text-textMuted">
                    {primaryColumn.label}
                  </span>
                  <div className="min-w-0 text-sm text-textPrimary">
                    {primaryColumn.render ? primaryColumn.render(row) : row[primaryColumn.key]}
                  </div>
                </div>
              )}

              {secondaryColumns.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {secondaryColumns.map((column) => (
                    <div key={column.key} className="min-w-0 rounded-lg bg-surfaceAlt p-3">
                      <span className="mb-1 block text-[11px] font-mono uppercase tracking-wider text-textMuted">
                        {column.label}
                      </span>
                      <div className="min-w-0 text-sm text-textPrimary">
                        {column.render ? column.render(row) : row[column.key]}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop: Table View */}
      <div className="hidden lg:block overflow-x-auto rounded-lg border border-border shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-border bg-surfaceAlt">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`text-left py-3 px-4 font-display font-bold text-textPrimary ${
                    column.sortable ? 'cursor-pointer hover:bg-surface' : ''
                  } ${column.className || ''}`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {column.sortable && sortKey === column.key && (
                      <span className="text-accent">
                        {sortDirection === 'asc' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedData.map((row, index) => (
              <tr
                key={index}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-border transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-surfaceAlt' : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`py-3 px-4 ${column.className || ''}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedData.length === 0 && (
          <div className="text-center py-12">
            <p className="text-textMuted font-sans">{emptyMessage}</p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {filteredAndSortedData.length > 0 && (
        <div className="flex items-center justify-between text-sm text-textMuted font-sans">
          <span>
            Showing {filteredAndSortedData.length} of {data.length} entries
          </span>
          {searchQuery && (
            <span>
              Filtered by: <span className="font-medium text-textPrimary">"{searchQuery}"</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
