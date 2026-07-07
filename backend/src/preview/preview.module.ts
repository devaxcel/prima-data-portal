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
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return { supported: false, reason: 'The file has no readable sheets.' };
      }

      const sheet = workbook.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: null,
        raw: false, // stringifies dates, numbers → readable strings
      });

      if (aoa.length === 0) {
        return { supported: false, reason: 'The sheet is empty.' };
      }

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
