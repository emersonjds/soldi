-- SOL-94 (P6): one free note per month and user.
CREATE TABLE month_notes (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month      date NOT NULL CHECK (extract(day FROM month) = 1),
    note       text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 140),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month)
);
