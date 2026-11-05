-- Cofrinhos (SOL-20): `Economia` (bill) and `Resgate` (income) are each user's savings
-- categories; a cofrinho is a child of `Economia`, and a resgate points at it.
ALTER TABLE categories
    ADD COLUMN is_savings boolean NOT NULL DEFAULT false,
    ADD COLUMN target numeric(12, 2) CHECK (target > 0),
    ADD COLUMN deadline date;

CREATE UNIQUE INDEX categories_savings_idx ON categories (user_id, kind) WHERE is_savings;

ALTER TABLE transactions
    ADD COLUMN cofrinho_id uuid,
    ADD CONSTRAINT transactions_cofrinho_fk FOREIGN KEY (user_id, cofrinho_id)
        REFERENCES categories (user_id, id);

CREATE INDEX transactions_cofrinho_idx ON transactions (user_id, cofrinho_id)
    WHERE cofrinho_id IS NOT NULL;

-- An active category already named like a savings one becomes it, top-level: the name is
-- unique per user and kind, so the insert below could not add it.
UPDATE categories c SET is_savings = true, parent_id = NULL, updated_at = now()
FROM (VALUES ('economia', 'bill'), ('resgate', 'income')) AS s (name, kind)
WHERE lower(c.name) = s.name AND c.kind = s.kind AND c.archived_at IS NULL;

INSERT INTO categories (user_id, name, kind, icon, color, is_savings)
SELECT u.id, s.name, s.kind, 'piggy-bank', 'cat-11', true
FROM users u CROSS JOIN (VALUES ('Economia', 'bill'), ('Resgate', 'income')) AS s (name, kind)
WHERE NOT EXISTS (
    SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.kind = s.kind AND c.is_savings);
