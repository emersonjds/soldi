CREATE TABLE categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
    kind        text NOT NULL CHECK (kind IN ('income', 'bill', 'daily')),
    icon        text NOT NULL CHECK (length(icon) BETWEEN 1 AND 50),
    color       text NOT NULL CHECK (color ~ '^cat-([1-9]|1[0-2])$'),
    archived_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    -- Target of (user_id, category_id) foreign keys: a row never points at another user's category.
    UNIQUE (user_id, id)
);

CREATE UNIQUE INDEX categories_active_name_idx
    ON categories (user_id, kind, lower(name)) WHERE archived_at IS NULL;
