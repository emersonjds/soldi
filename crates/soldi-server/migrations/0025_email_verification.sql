-- SOL-96 (P11): verified e-mail. Only the SHA-256 of the token in the link is stored.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE email_verifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_verifications_user_idx ON email_verifications (user_id);
