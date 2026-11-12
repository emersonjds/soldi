-- SOL-118 (D36): an open series keeps growing on read; `series_offset` counts parcelas paid
-- before the first written member. Both live on every member, like series_every (D32).
ALTER TABLE transactions
    ADD COLUMN series_open boolean NOT NULL DEFAULT false,
    ADD COLUMN series_offset smallint NOT NULL DEFAULT 0 CHECK (series_offset BETWEEN 0 AND 59),
    ADD CONSTRAINT transactions_series_open_ck CHECK (NOT series_open OR series_id IS NOT NULL),
    ADD CONSTRAINT transactions_series_offset_ck CHECK (series_offset = 0 OR series_id IS NOT NULL);

CREATE INDEX transactions_open_series_idx ON transactions (user_id, series_id, date)
    WHERE series_open;
