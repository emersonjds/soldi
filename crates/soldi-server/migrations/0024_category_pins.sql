-- SOL-95 (P9): the user's pinned order of top-level categories for the chip rows.
ALTER TABLE categories ADD COLUMN pin_rank smallint CHECK (pin_rank BETWEEN 1 AND 24);
CREATE UNIQUE INDEX categories_pin_rank_idx ON categories (user_id, pin_rank)
    WHERE pin_rank IS NOT NULL;
