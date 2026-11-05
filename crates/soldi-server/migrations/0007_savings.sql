CREATE TABLE savings (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    year       smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    month      smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
    amount     numeric(12, 2) NOT NULL CHECK (amount >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, year, month)
);
