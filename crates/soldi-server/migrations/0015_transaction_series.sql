-- Repeated entries (SOL-21, D14): rows launched together share `series_id`; no series table.
ALTER TABLE transactions ADD COLUMN series_id uuid;

CREATE INDEX transactions_series_idx ON transactions (user_id, series_id, date)
    WHERE series_id IS NOT NULL;
