-- SOL-118 (D35): a bill owes up to `last_month` (a month's first day); null owes with no end.
-- `installments` makes it parcelado: month m holds parcela installments - months(m -> last_month).
-- Forward-only; the revert lives in docs/specs/cards/SOL-118.md.
ALTER TABLE recurring_bills
    ADD COLUMN last_month date CHECK (last_month = date_trunc('month', last_month)::date),
    ADD COLUMN installments smallint CHECK (installments BETWEEN 2 AND 60),
    ADD CONSTRAINT recurring_bills_installments_end CHECK (installments IS NULL OR last_month IS NOT NULL),
    ADD CONSTRAINT recurring_bills_card_no_end
        CHECK (closing_day IS NULL OR (last_month IS NULL AND installments IS NULL));

-- A paused bill owed nothing; it now ends at its last paid month, or before it started owing.
UPDATE recurring_bills b
SET last_month = GREATEST(
        (date_trunc('month', b.active_since) - interval '1 month')::date,
        (SELECT max(date_trunc('month', t.date))::date FROM transactions t
          WHERE t.user_id = b.user_id AND t.recurring_bill_id = b.id))
WHERE NOT b.active;

ALTER TABLE recurring_bills DROP COLUMN active;
