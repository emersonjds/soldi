-- The only ledger (D8). `kind` is copied from the category at insert for fast sums.
CREATE TABLE transactions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    date              date NOT NULL,
    amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
    kind              text NOT NULL CHECK (kind IN ('income', 'bill', 'daily')),
    category_id       uuid NOT NULL,
    note              text CHECK (length(note) <= 500),
    recurring_bill_id uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id),
    FOREIGN KEY (user_id, recurring_bill_id) REFERENCES recurring_bills (user_id, id)
);

CREATE INDEX transactions_user_date_idx ON transactions (user_id, date);
CREATE INDEX transactions_recurring_bill_idx ON transactions (recurring_bill_id)
    WHERE recurring_bill_id IS NOT NULL;
