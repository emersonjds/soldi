-- The spreadsheet importer is gone (SOL-59); imported entries stay as ordinary entries.
DROP TABLE import_previews;
DROP INDEX transactions_import_idx;
ALTER TABLE transactions
    DROP COLUMN import_batch_id,
    DROP COLUMN import_year;
