-- ============================================================================
-- WP-3 MIGRATION (MySQL / MariaDB XAMPP): Order Hold & Resume Logic
-- ============================================================================

-- 1. Add stock_quantity to tblproducts (default 100 units for existing items)
ALTER TABLE tblproducts
  ADD COLUMN IF NOT EXISTS stock_quantity INT(11) NOT NULL DEFAULT 100;

-- 2. Add terminal_id and shift_id to tblheld_transactions
ALTER TABLE tblheld_transactions
  ADD COLUMN IF NOT EXISTS terminal_id INT(11) NULL,
  ADD COLUMN IF NOT EXISTS shift_id INT(11) NULL;

-- Clear any legacy un-paired held rows from prior test runs
DELETE FROM tblheld_transactions WHERE terminal_id IS NULL OR shift_id IS NULL;

-- ============================================================================
-- ROLLBACK NOTES (MySQL / MariaDB)
-- ============================================================================
-- ALTER TABLE tblheld_transactions
--   DROP COLUMN IF EXISTS terminal_id,
--   DROP COLUMN IF EXISTS shift_id;
-- ALTER TABLE tblproducts
--   DROP COLUMN IF EXISTS stock_quantity;

