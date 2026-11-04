-- ============================================================================
-- WP-3 MIGRATION (PostgreSQL): Order Hold & Resume Logic
-- ============================================================================
-- 1. Adds stock_quantity to tblproducts for stock policy enforcement (no
--    decrement on hold; decrement on completion; re-validate on resume).
-- 2. Adds terminal_id and shift_id to tblheld_transactions to enforce strict
--    session isolation (same cashier + same terminal + same shift).
-- ============================================================================

BEGIN;

-- 1. Add stock_quantity to tblproducts (default 100 units for existing items)
ALTER TABLE tblproducts
  ADD COLUMN IF NOT EXISTS stock_quantity INT NOT NULL DEFAULT 100;

-- 2. Add terminal_id and shift_id to tblheld_transactions
ALTER TABLE tblheld_transactions
  ADD COLUMN IF NOT EXISTS terminal_id INT NULL,
  ADD COLUMN IF NOT EXISTS shift_id INT NULL;

CREATE INDEX IF NOT EXISTS idx_held_pairing
  ON tblheld_transactions (cashier_user_id, terminal_id, shift_id);

COMMIT;

-- ============================================================================
-- ROLLBACK NOTES (PostgreSQL)
-- ============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS idx_held_pairing;
-- ALTER TABLE tblheld_transactions
--   DROP COLUMN IF EXISTS terminal_id,
--   DROP COLUMN IF EXISTS shift_id;
-- ALTER TABLE tblproducts
--   DROP COLUMN IF EXISTS stock_quantity;
-- COMMIT;

