-- Add previewData JSON column to DatasetVersion
-- Stores first N rows of the underlying file as JSON so clients can preview
-- the actual contents (columns + rows) before downloading.

ALTER TABLE "DatasetVersion" ADD COLUMN "previewData" JSONB;
