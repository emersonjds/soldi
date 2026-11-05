-- Subcategories, one level deep (SOL-14). The composite key keeps a parent within the same user.
ALTER TABLE categories
    ADD COLUMN parent_id uuid,
    ADD CONSTRAINT categories_parent_fk FOREIGN KEY (user_id, parent_id)
        REFERENCES categories (user_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT categories_parent_not_self CHECK (parent_id <> id);

CREATE INDEX categories_parent_idx ON categories (user_id, parent_id);
