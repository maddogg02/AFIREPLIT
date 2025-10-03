# Release Notes

## 2025-10-02

- Added an optional `ENABLE_STORAGE_BACKFILL` startup flag that queues the Supabase storage migrator so older PDFs/CSVs are uploaded automatically.
- Extended `migrate_to_supabase_storage.js` to push both PDFs and parsed CSVs to Supabase and to expose its logic for background runs.
- Introduced a database migration (`20251002_backfill_csv_storage.sql`) that seeds `csv_storage_path` for legacy records that still reference on-disk CSV files.
- Documented the required Supabase/OpenAI/Postgres environment variables in `QUICKSTART_STORAGE.md` so teammates can bootstrap their `.env` in one place.
- Reminder: if a legacy document still shows a disabled CSV button after this release, rerun `node migrate_to_supabase_storage.js` (or enable the backfill flag) once the original CSVs are restored in `temp/` or `uploads/`.
