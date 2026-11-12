-- SOL-93 (D32): the step of a repeated run, on every member; null outside a series.
ALTER TABLE transactions ADD COLUMN series_every text
    CHECK (series_every IN ('month', 'week', 'year'));
UPDATE transactions SET series_every = 'month' WHERE series_id IS NOT NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_series_every_ck
    CHECK ((series_id IS NULL) = (series_every IS NULL));
