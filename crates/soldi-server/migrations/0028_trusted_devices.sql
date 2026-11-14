-- SOL-132 (D39): a browser that signed in before skips the per-e-mail sign-in ceiling. Only the
-- SHA-256 of the token in the device cookie is stored; at most 20 per user, oldest dropped.
CREATE TABLE trusted_devices (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trusted_devices_user_idx ON trusted_devices (user_id, created_at);
