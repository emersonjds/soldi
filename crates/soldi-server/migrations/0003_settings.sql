-- One row per user, created at sign-up. Tier defaults are the owner's spreadsheet (D9).
CREATE TABLE settings (
    user_id          uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    opening_balance  numeric(12, 2) NOT NULL DEFAULT 0,
    opening_date     date NOT NULL DEFAULT current_date,
    tier_red         numeric(12, 2) NOT NULL DEFAULT -500,
    tier_zero        numeric(12, 2) NOT NULL DEFAULT 0,
    tier_yellow      numeric(12, 2) NOT NULL DEFAULT 1000,
    tier_green       numeric(12, 2) NOT NULL DEFAULT 2000,
    savings_goal_pct smallint CHECK (savings_goal_pct BETWEEN 0 AND 100),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT settings_tiers_increasing
        CHECK (tier_red < tier_zero AND tier_zero < tier_yellow AND tier_yellow < tier_green)
);
