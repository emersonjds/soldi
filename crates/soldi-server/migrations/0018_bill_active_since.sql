-- SOL-55 (D17): the São Paulo day a bill starts owing; registration, or its last resume (D13).
ALTER TABLE recurring_bills ADD COLUMN active_since date;

UPDATE recurring_bills SET active_since = (created_at AT TIME ZONE 'America/Sao_Paulo')::date;

ALTER TABLE recurring_bills
    ALTER COLUMN active_since SET NOT NULL,
    ALTER COLUMN active_since SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
