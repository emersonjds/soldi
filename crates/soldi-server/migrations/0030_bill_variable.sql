-- SOL-152 (D44): a conta fixa whose amount is an estimate that changes every month; never a card.
-- Forward-only; the revert lives in docs/specs/cards/SOL-152.md §3.7.
ALTER TABLE recurring_bills
    ADD COLUMN variable boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT recurring_bills_card_not_variable CHECK (closing_day IS NULL OR NOT variable);
