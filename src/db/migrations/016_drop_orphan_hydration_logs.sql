-- Drop orphan table hydration_logs (plural).
-- Confirmed via SQL audit (2026-06): no controller query references it; 0 rows.
-- The active hydration table is hydration_log (singular).
DROP TABLE IF EXISTS hydration_logs;
