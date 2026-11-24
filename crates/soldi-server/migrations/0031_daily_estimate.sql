-- SOL-164 (D49): the opt-in Diário previsto. Forward-only; the revert is in docs/specs/cards/SOL-164.md.
ALTER TABLE settings
    ADD COLUMN daily_estimate numeric(12, 2) CHECK (daily_estimate BETWEEN 0.01 AND 10000.00),
    ADD COLUMN daily_estimate_on boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT settings_daily_estimate_on_has_value
        CHECK (NOT daily_estimate_on OR daily_estimate IS NOT NULL);
