import { Injectable, Logger, Module } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface DatasetPreview {
  supported: true;
  sheetName?: string;
  columns: string[];
  rows: (string | number | null)[][];
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
}

export interface UnsupportedPreview {
  supported: false;
  reason: string;
  fileType?: string;
}

export type PreviewResult = DatasetPreview | UnsupportedPreview;

const MAX_ROWS = 100;
const MAX_COLS = 40;

/** File types we can extract table data from */
const TABLE_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel',                                          // xls
  'application/vnd.oasis.opendocument.spreadsheet',                    // ods
  'text/csv',                                                          // csv
  'text/tab-separated-values',                                         // tsv
  'application/csv',
]);

const TABLE_EXTS = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv']);

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  /**
   * Attempt to extract a preview from raw file bytes.
   * Never throws — always returns a PreviewResult (either supported or a
   * `supported: false` explanation).
   */
  fromBytes(bytes: Buffer, fileName: string, mimeType: string): PreviewResult {
    if (!this.isTableFile(fileName, mimeType)) {
      return {
        supported: false,
        reason: 'Preview is only available for spreadsheet files (XLSX, CSV, TSV).',
        fileType: this.extOf(fileName).toUpperCase() || 'FILE',
      };
    }

    try {
      const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, cellFormula: false });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return { supported: false, reason: 'The file has no readable sheets.' };
      }

      // Try each sheet in order; take the first with meaningful tabular data.
      // Complex Excel models (e.g. financial models) often have a "Dashboard"
      // sheet full of charts as sheet 0 — no tabular data. We should skip past
      // that to find the actual data sheet (Income Statement, Balance Sheet, etc).
      let best: {
        sheetName: string;
        aoa: any[][];
        score: number;
      } | null = null;

      for (const candidateName of workbook.SheetNames) {
        const sheet = workbook.Sheets[candidateName];
        if (!sheet) continue;
        const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          blankrows: false,
          defval: null,
          raw: false,
        });

        // Score based on how "tabular" the data looks
        const rowCount = aoa.length;
        if (rowCount < 2) continue;

        const headerRow = (aoa[0] ?? []) as any[];
        const colCount = headerRow.length;
        if (colCount < 2) continue;

        // Count non-null cells across all rows (sample first 20 rows for speed)
        let nonNullCells = 0;
        for (let i = 0; i < Math.min(20, aoa.length); i++) {
          const row = (aoa[i] ?? []) as any[];
          nonNullCells += row.filter((v) => v != null && v !== '').length;
        }
        // Score: cells × rows-log — favours sheets with real content
        const score = nonNullCells * Math.log2(Math.max(rowCount, 2));

        if (!best || score > best.score) {
          best = { sheetName: candidateName, aoa, score };
        }

        // Fast-exit: first "obviously good" sheet wins
        if (rowCount > 5 && colCount > 3 && nonNullCells > 20) {
          best = { sheetName: candidateName, aoa, score };
          break;
        }
      }

      if (!best || best.aoa.length === 0) {
        return { supported: false, reason: 'No sheets in this workbook contain readable tabular data.' };
      }

      const { sheetName, aoa } = best;
      const totalRows = Math.max(0, aoa.length - 1); // excludes header
      const rawHeader = (aoa[0] ?? []) as any[];
      const totalColumns = rawHeader.length;
      const columns = rawHeader
        .slice(0, MAX_COLS)
        .map((c, i) => (c == null || c === '' ? `Column ${i + 1}` : String(c)));

      const rows: (string | number | null)[][] = [];
      for (let i = 1; i < aoa.length && rows.length < MAX_ROWS; i++) {
        const raw = (aoa[i] ?? []) as any[];
        rows.push(raw.slice(0, MAX_COLS).map((v) => this.normalize(v)));
      }

      return {
        supported: true,
        sheetName,
        columns,
        rows,
        totalRows,
        totalColumns,
        truncated: totalRows > MAX_ROWS || totalColumns > MAX_COLS,
      };
    } catch (err) {
      this.logger.warn(`Preview extraction failed for ${fileName}: ${(err as Error).message}`);
      return {
        supported: false,
        reason: 'Could not read the file — it may be corrupt or password protected.',
      };
    }
  }

  private isTableFile(fileName: string, mimeType: string): boolean {
    if (TABLE_TYPES.has(mimeType.toLowerCase())) return true;
    return TABLE_EXTS.has(this.extOf(fileName));
  }

  private extOf(fileName: string): string {
    return (fileName.split('.').pop() ?? '').toLowerCase();
  }

  private normalize(v: any): string | number | null {
    if (v == null) return null;
    if (typeof v === 'number' || typeof v === 'string') return v;
    if (v instanceof Date) return v.toISOString().split('T')[0];
    return String(v);
  }
}

@Module({
  providers: [PreviewService],
  exports: [PreviewService],
})
export class PreviewModule {}
