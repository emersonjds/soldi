-- SOL-186 (D55): the last São Paulo day whose due occurrences were auto-paid; starts the day before.
ALTER TABLE recurring_bills
    ADD COLUMN auto_paid_through date NOT NULL
        DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1);
