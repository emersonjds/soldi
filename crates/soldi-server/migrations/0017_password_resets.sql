-- Password-reset links (SOL-37). Only the SHA-256 of the token in the link is stored.
CREATE TABLE password_resets (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_resets_user_idx ON password_resets (user_id);
