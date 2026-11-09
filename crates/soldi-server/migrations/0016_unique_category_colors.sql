-- Unique top-level colors per kind, subcategories wear their parent's (SOL-32, D15).
ALTER TABLE categories
    DROP CONSTRAINT categories_color_check,
    ADD CONSTRAINT categories_color_check CHECK (color ~ '^cat-([1-9]|1[0-9]|2[0-4])$');

-- The first active top-level holding a color keeps it; each later one takes the lowest free token.
-- More than 24 in a kind leaves no token: the NOT NULL check fails the migration.
DO $$
DECLARE
    duplicate record;
BEGIN
    FOR duplicate IN
        SELECT id, user_id, kind FROM (
            SELECT id, user_id, kind, created_at, row_number() OVER (
                PARTITION BY user_id, kind, color ORDER BY created_at, id) AS rank
            FROM categories WHERE parent_id IS NULL AND archived_at IS NULL) ranked
        WHERE rank > 1
        ORDER BY user_id, kind, created_at, id
    LOOP
        UPDATE categories SET color = (
            SELECT 'cat-' || n FROM generate_series(1, 24) n
            WHERE 'cat-' || n NOT IN (
                SELECT color FROM categories
                WHERE user_id = duplicate.user_id AND kind = duplicate.kind
                  AND parent_id IS NULL AND archived_at IS NULL)
            ORDER BY n LIMIT 1)
        WHERE id = duplicate.id;
    END LOOP;
END $$;

UPDATE categories child SET color = parent.color
FROM categories parent
WHERE parent.user_id = child.user_id AND parent.id = child.parent_id
  AND child.color <> parent.color;

CREATE UNIQUE INDEX categories_top_color_idx
    ON categories (user_id, kind, color) WHERE parent_id IS NULL AND archived_at IS NULL;
