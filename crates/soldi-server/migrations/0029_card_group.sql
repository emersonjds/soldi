-- SOL-140 (D43): the account's card group; a card created without a category lands in it.
ALTER TABLE categories ADD COLUMN is_card_group boolean NOT NULL DEFAULT false;

UPDATE categories SET is_card_group = true
WHERE parent_id IS NULL AND kind = 'bill' AND archived_at IS NULL AND lower(name) = lower('Cartão');

CREATE UNIQUE INDEX categories_card_group_idx
    ON categories (user_id) WHERE is_card_group AND archived_at IS NULL;
