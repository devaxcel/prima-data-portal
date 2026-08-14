'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FileText, Table as TableIcon, AlertCircle, Loader2 } from 'lucide-react';

interface TablePreview {
  supported: true;
  kind: 'table';
  sheetName?: string;
  columns: string[];
  rows: (string | number | null)[][];
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
}

interface TextPreview {
  supported: true;
  kind: 'text';
  text: string;
  totalLength: number;
  pageCount?: number;
  fileType: string;
  truncated: boolean;
}

interface Unsupported {
  supported: false;
  reason: string;
  fileType?: string;
}

// Older cached previews may lack the `kind` field; treat those as tables
type LegacyTable = Omit<TablePreview, 'kind'>;
type PreviewResponse = TablePreview | TextPreview | Unsupported | LegacyTable;

interface Props {
  datasetId: string;
  maxHeight?: number; // px
}

export function DatasetPreviewTable({ datasetId, maxHeight = 420 }: Props) {
  const { data, isLoading, isError, error } = useQuery<PreviewResponse>({
    queryKey: ['dataset-preview', datasetId],
    queryFn: async () => (await api.get(`/datasets/${datasetId}/preview`)).data,
    staleTime: 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-stone-500 text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin text-brand-500" />
        Generating preview…
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<AlertCircle className="w-6 h-6 text-red-400" />}
        title="Could not load preview"
        subtitle={(error as any)?.response?.data?.message ?? 'Please try again in a moment.'}
      />
    );
  }

  if (!data || data.supported === false) {
    return (
      <EmptyState
        icon={<FileText className="w-6 h-6 text-stone-400" />}
        title={data?.reason ?? 'Preview not available'}
        subtitle={data && 'fileType' in data && data.fileType
          ? `${data.fileType} files cannot be previewed in-browser.`
          : 'You can still download the file to view its contents.'}
      />
    );
  }

  // Text preview (DOCX / PDF)
  if ('kind' in data && data.kind === 'text') {
    return (
      <div className="border border-stone-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-3 text-xs text-stone-500">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
            <span className="truncate">
              <span className="font-medium text-stone-700">{data.fileType}</span>
              {data.pageCount ? <> · {data.pageCount} page{data.pageCount === 1 ? '' : 's'}</> : null}
              <> · {data.totalLength.toLocaleString()} characters</>
            </span>
          </div>
          {data.truncated && (
            <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium whitespace-nowrap">
              Truncated
            </span>
          )}
        </div>
        <div
          className="overflow-auto p-4 text-xs text-stone-700 whitespace-pre-wrap leading-relaxed font-serif bg-white"
          style={{ maxHeight }}
        >
          {data.text}
        </div>
        {data.truncated && (
          <div className="px-4 py-2 bg-stone-50 border-t border-stone-200 text-[11px] text-stone-500 text-center">
            Preview shows the beginning of the document. Download the file to see the full contents.
          </div>
        )}
      </div>
    );
  }

  // Table preview — either kind === 'table' or older legacy shape (no kind field)
  const tableData = data as TablePreview;
  const { columns, rows, totalRows, totalColumns, truncated, sheetName } = tableData;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<TableIcon className="w-6 h-6 text-stone-400" />}
        title="The sheet is empty"
        subtitle="Only column headers were found."
      />
    );
  }

  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden">
      {/* Meta bar */}
      <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-3 text-xs text-stone-500">
        <div className="flex items-center gap-2 min-w-0">
          <TableIcon className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
          <span className="truncate">
            {sheetName ? <><span className="font-medium text-stone-700">{sheetName}</span> · </> : null}
            {rows.length.toLocaleString()} of {totalRows.toLocaleString()} rows
            {totalColumns > columns.length && (
              <> · {columns.length} of {totalColumns} columns</>
            )}
          </span>
        </div>
        {truncated && (
          <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium whitespace-nowrap">
            Truncated
          </span>
        )}
      </div>

      {/* Scrollable table */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_0_theme(colors.stone.200)]">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left text-[11px] font-semibold text-stone-700 whitespace-nowrap border-r border-stone-100 last:border-r-0"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={`border-t border-stone-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-stone-50/40'} hover:bg-brand-50/40`}
              >
                {columns.map((_, ci) => {
                  const cell = row[ci];
                  const display = cell == null || cell === '' ? '' : String(cell);
                  return (
                    <td
                      key={ci}
                      className="px-3 py-1.5 text-stone-700 whitespace-nowrap border-r border-stone-100 last:border-r-0 max-w-[280px] overflow-hidden text-ellipsis"
                      title={display.length > 40 ? display : undefined}
                    >
                      {display || <span className="text-stone-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {truncated && (
        <div className="px-4 py-2 bg-stone-50 border-t border-stone-200 text-[11px] text-stone-500 text-center">
          Preview shows the first {rows.length} of {totalRows.toLocaleString()} rows. Download the file for the full dataset.
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="border border-stone-200 rounded-lg py-12 px-6 text-center bg-stone-50/40">
      <div className="mx-auto w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center mb-3">
        {icon}
      </div>
      <div className="text-sm font-medium text-stone-700 mb-1">{title}</div>
      {subtitle && <div className="text-xs text-stone-500 max-w-sm mx-auto">{subtitle}</div>}
    </div>
  );
}
