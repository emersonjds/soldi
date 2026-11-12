-- SOL-94: a cofrinho's description (P4) and the yearly savings target (P5).
ALTER TABLE categories ADD COLUMN note text CHECK (char_length(note) BETWEEN 1 AND 140);
ALTER TABLE settings ADD COLUMN savings_target_pct numeric(5, 2)
    CHECK (savings_target_pct > 0 AND savings_target_pct <= 100);
