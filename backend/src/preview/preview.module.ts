import { Injectable, Logger, Module } from '@nestjs/common';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

/** Tabular preview — for XLSX, CSV, etc */
export interface TablePreview {
  supported: true;
  kind: 'table';
  sheetName?: string;
  columns: string[];
  rows: (string | number | null)[][];
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
}

/** Text preview — for DOCX, PDF */
export interface TextPreview {
  supported: true;
  kind: 'text';
  text: string;
  totalLength: number;
  pageCount?: number;
  fileType: string;
  truncated: boolean;
}

export interface UnsupportedPreview {
  supported: false;
  reason: string;
  fileType?: string;
}

export type PreviewResult = TablePreview | TextPreview | UnsupportedPreview;

const MAX_ROWS = 100;
const MAX_COLS = 40;
const MAX_TEXT_CHARS = 5000; // ~800 words for Word/PDF previews

const TABLE_EXTS = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv']);
const DOCX_EXTS = new Set(['docx']);
const PDF_EXTS = new Set(['pdf']);

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  /**
   * Extract a preview from raw file bytes. Never throws — always returns
   * a PreviewResult (either supported or a `supported: false` explanation).
   * Async because DOCX/PDF parsers are promise-based.
   */
  async fromBytes(bytes: Buffer, fileName: string): Promise<PreviewResult> {
    const ext = this.extOf(fileName);

    if (TABLE_EXTS.has(ext)) return this.previewSpreadsheet(bytes, fileName);
    if (DOCX_EXTS.has(ext)) return this.previewDocx(bytes);
    if (PDF_EXTS.has(ext)) return this.previewPdf(bytes);

    return {
      supported: false,
      reason: 'Preview is available for spreadsheets (XLSX, CSV), Word documents (DOCX), and PDFs.',
      fileType: ext.toUpperCase() || 'FILE',
    };
  }

  // ─── Spreadsheet ─────────────────────────────────────────────

  private previewSpreadsheet(bytes: Buffer, fileName: string): PreviewResult {
    try {
      const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, cellFormula: false });
      if (!workbook.SheetNames?.length) {
        return { supported: false, reason: 'The file has no readable sheets.' };
      }

      // Try each sheet; pick the first with meaningful tabular data
      let best: { sheetName: string; aoa: any[][]; score: number } | null = null;

      for (const candidateName of workbook.SheetNames) {
        const sheet = workbook.Sheets[candidateName];
        if (!sheet) continue;
        const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
          header: 1, blankrows: false, defval: null, raw: false,
        });

        const rowCount = aoa.length;
        if (rowCount < 2) continue;

        const headerRow = (aoa[0] ?? []) as any[];
        const colCount = headerRow.length;
        if (colCount < 2) continue;

        let nonNullCells = 0;
        for (let i = 0; i < Math.min(20, aoa.length); i++) {
          const row = (aoa[i] ?? []) as any[];
          nonNullCells += row.filter((v) => v != null && v !== '').length;
        }
        const score = nonNullCells * Math.log2(Math.max(rowCount, 2));

        if (!best || score > best.score) best = { sheetName: candidateName, aoa, score };
        if (rowCount > 5 && colCount > 3 && nonNullCells > 20) {
          best = { sheetName: candidateName, aoa, score };
          break;
        }
      }

      if (!best || best.aoa.length === 0) {
        return { supported: false, reason: 'No sheets in this workbook contain readable tabular data.' };
      }

      const { sheetName, aoa } = best;
      const totalRows = Math.max(0, aoa.length - 1);
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
        supported: true, kind: 'table',
        sheetName, columns, rows, totalRows, totalColumns,
        truncated: totalRows > MAX_ROWS || totalColumns > MAX_COLS,
      };
    } catch (err) {
      this.logger.warn(`Spreadsheet preview failed for ${fileName}: ${(err as Error).message}`);
      return { supported: false, reason: 'Could not read the file — it may be corrupt or password protected.' };
    }
  }

  // ─── DOCX ────────────────────────────────────────────────────

  private async previewDocx(bytes: Buffer): Promise<PreviewResult> {
    try {
      const result = await mammoth.extractRawText({ buffer: bytes });
      const fullText = (result.value ?? '').trim();
      if (!fullText) return { supported: false, reason: 'The document appears to be empty or unreadable.' };

      const truncated = fullText.length > MAX_TEXT_CHARS;
      return {
        supported: true, kind: 'text',
        text: truncated ? fullText.slice(0, MAX_TEXT_CHARS) + '…' : fullText,
        totalLength: fullText.length,
        fileType: 'DOCX',
        truncated,
      };
    } catch (err) {
      this.logger.warn(`DOCX preview failed: ${(err as Error).message}`);
      return { supported: false, reason: 'Could not read this Word document — it may be corrupt or password protected.' };
    }
  }

  // ─── PDF ─────────────────────────────────────────────────────

  private async previewPdf(bytes: Buffer): Promise<PreviewResult> {
    try {
      const result = await pdfParse(bytes, { max: 5 }); // parse first 5 pages
      const fullText = (result.text ?? '').trim();
      if (!fullText) {
        return { supported: false, reason: 'The PDF appears to contain no extractable text (may be image-based/scanned).' };
      }
      const truncated = fullText.length > MAX_TEXT_CHARS;
      return {
        supported: true, kind: 'text',
        text: truncated ? fullText.slice(0, MAX_TEXT_CHARS) + '…' : fullText,
        totalLength: fullText.length,
        pageCount: result.numpages,
        fileType: 'PDF',
        truncated,
      };
    } catch (err) {
      this.logger.warn(`PDF preview failed: ${(err as Error).message}`);
      return { supported: false, reason: 'Could not read this PDF — it may be corrupt or password protected.' };
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

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
