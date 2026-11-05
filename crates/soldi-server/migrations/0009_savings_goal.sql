-- A goal of 0% is no goal (SOL-5 rule 7): it reads as null and the range starts at 1.
UPDATE settings SET savings_goal_pct = NULL WHERE savings_goal_pct = 0;

ALTER TABLE settings
    DROP CONSTRAINT settings_savings_goal_pct_check,
    ADD CONSTRAINT settings_savings_goal_pct_check CHECK (savings_goal_pct BETWEEN 1 AND 100);
