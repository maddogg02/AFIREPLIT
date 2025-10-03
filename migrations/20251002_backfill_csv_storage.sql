-- Backfill csv_storage_path for historical documents so the UI knows when CSV downloads are available
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS csv_storage_path TEXT;

UPDATE documents
   SET csv_storage_path = csv_path
 WHERE csv_storage_path IS NULL
   AND csv_path IS NOT NULL;

COMMENT ON COLUMN documents.csv_storage_path IS 'Supabase storage path for parsed CSV artefacts (mirrors csv_path for legacy data).';
