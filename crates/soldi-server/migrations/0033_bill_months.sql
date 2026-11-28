-- SOL-173 (D56): one month of a conta fixa or parcelada set apart: its own amount, or skipped.
CREATE TABLE bill_months (
    user_id    uuid NOT NULL,
    bill_id    uuid NOT NULL,
    month      date NOT NULL CHECK (extract(day FROM month) = 1),
    amount     numeric(12, 2) CHECK (amount > 0),
    skipped    boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, bill_id, month),
    FOREIGN KEY (user_id, bill_id) REFERENCES recurring_bills (user_id, id) ON DELETE CASCADE,
    CHECK (skipped OR amount IS NOT NULL)
);
