-- D28: a card is a recurring bill with a closing day and no amount; a Diário entry may sit on one.
-- Forward-only; the revert lives in docs/specs/2026-11-12-categories-and-cards.md §4.
ALTER TABLE recurring_bills
    ADD COLUMN closing_day smallint CHECK (closing_day BETWEEN 1 AND 31),
    ALTER COLUMN amount DROP NOT NULL,
    ADD CONSTRAINT recurring_bills_card_amount CHECK ((closing_day IS NULL) = (amount IS NOT NULL));

ALTER TABLE transactions
    ADD COLUMN card_id uuid,
    ADD CONSTRAINT transactions_card_fk FOREIGN KEY (user_id, card_id)
        REFERENCES recurring_bills (user_id, id),
    ADD CONSTRAINT transactions_card_daily CHECK (card_id IS NULL OR kind = 'daily');

CREATE INDEX transactions_card_idx ON transactions (user_id, card_id, date)
    WHERE card_id IS NOT NULL;
