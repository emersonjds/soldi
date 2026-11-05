-- A parsed workbook waiting for the user's confirmation (SOL-7).
CREATE TABLE import_previews (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
    payload    jsonb NOT NULL
);

CREATE INDEX import_previews_user_idx ON import_previews (user_id);

-- Rows written by an import; a later import of the same year replaces them.
ALTER TABLE transactions
    ADD COLUMN import_batch_id uuid,
    ADD COLUMN import_year     smallint;

ALTER TABLE savings
    ADD COLUMN import_batch_id uuid,
    ADD COLUMN import_year     smallint;

CREATE INDEX transactions_import_idx ON transactions (user_id, import_year)
    WHERE import_batch_id IS NOT NULL;
