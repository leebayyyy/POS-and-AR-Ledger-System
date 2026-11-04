-- ============================================================================
-- WP-1 Migration (MySQL / MariaDB): Shifting & Cash Management
-- Purpose:
--   1. Add tblsystem_settings for store-level config (e.g., min_opening_float)
--   2. Add EOS breakdown & audit columns to tblshifts
--   3. Add notes column to tbldrawer_events
--   4. Add shift_id reference to tblsales
--   5. Close any stale unclosed shifts so fresh cashier logins prompt for float
-- ============================================================================

USE pos_ar_system;

-- 1. System settings key-value table
CREATE TABLE IF NOT EXISTS tblsystem_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO tblsystem_settings (setting_key, setting_value, description)
VALUES ('min_opening_float', '0.00', 'Minimum allowed opening cash float (PHP) when starting a shift')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- 2. Extend tblshifts with full End-of-Shift (EOS) reconciliation columns
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS floats_added_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS current_float DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS cash_sales_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS refunds_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS lifts_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS ar_sales_count INT NOT NULL DEFAULT 0;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS ar_sales_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS variance_amount DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS closed_by_supervisor_id INT DEFAULT NULL;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS auth_log_id INT DEFAULT NULL;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS summary_json LONGTEXT DEFAULT NULL;

-- 3. Extend tbldrawer_events with notes
ALTER TABLE tbldrawer_events ADD COLUMN IF NOT EXISTS notes VARCHAR(255) DEFAULT NULL;

-- 4. Link tblsales to tblshifts
ALTER TABLE tblsales ADD COLUMN IF NOT EXISTS shift_id INT DEFAULT NULL;

SET @idx_sales_shift = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tblsales' AND index_name = 'idx_sales_shift_id');
SET @idx_sales_shift_sql = IF(@idx_sales_shift = 0, 'CREATE INDEX idx_sales_shift_id ON tblsales(shift_id)', 'SELECT 1');
PREPARE stmt_idx_shift FROM @idx_sales_shift_sql;
EXECUTE stmt_idx_shift;
DEALLOCATE PREPARE stmt_idx_shift;

-- 5. Close any stale open shifts so fresh cashier logins prompt for float
UPDATE tblshifts
SET status = 'closed',
    closed_at = CURRENT_TIMESTAMP
WHERE status = 'open';

-- ============================================================================
-- ROLLBACK NOTES (MySQL / MariaDB):
-- ALTER TABLE tblsales DROP INDEX IF EXISTS idx_sales_shift_id;
-- ALTER TABLE tblsales DROP COLUMN IF EXISTS shift_id;
-- ALTER TABLE tbldrawer_events DROP COLUMN IF EXISTS notes;
-- ALTER TABLE tblshifts
--   DROP COLUMN IF EXISTS summary_json,
--   DROP COLUMN IF EXISTS auth_log_id,
--   DROP COLUMN IF EXISTS closed_by_supervisor_id,
--   DROP COLUMN IF EXISTS variance_amount,
--   DROP COLUMN IF EXISTS ar_sales_total,
--   DROP COLUMN IF EXISTS ar_sales_count,
--   DROP COLUMN IF EXISTS lifts_total,
--   DROP COLUMN IF EXISTS refunds_total,
--   DROP COLUMN IF EXISTS cash_sales_total,
--   DROP COLUMN IF EXISTS current_float,
--   DROP COLUMN IF EXISTS floats_added_total;
-- DROP TABLE IF EXISTS tblsystem_settings;
-- ============================================================================

