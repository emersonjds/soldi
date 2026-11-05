-- A recurring bill is paid at most once a month (D10, SOL-4 rule 4). `date::timestamp` keeps
-- date_trunc immutable, which an index expression needs.
CREATE UNIQUE INDEX transactions_bill_month_idx
    ON transactions (recurring_bill_id, date_trunc('month', date::timestamp))
    WHERE recurring_bill_id IS NOT NULL;

DROP INDEX transactions_recurring_bill_idx;
