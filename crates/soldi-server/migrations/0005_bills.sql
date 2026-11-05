CREATE TABLE recurring_bills (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    category_id uuid NOT NULL,
    name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
    -- 29..31 clamps to the last day of a shorter month.
    due_day     smallint NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    active      boolean NOT NULL DEFAULT true,
    archived_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id)
);

CREATE INDEX recurring_bills_user_idx ON recurring_bills (user_id);
