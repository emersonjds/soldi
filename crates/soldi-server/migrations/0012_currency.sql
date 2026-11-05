-- The currency the user picks at onboarding (SOL-19); every amount is shown in it.
ALTER TABLE settings
    ADD COLUMN currency char(3) NOT NULL DEFAULT 'BRL'
        CHECK (currency IN ('BRL', 'USD', 'GBP', 'EUR'));
