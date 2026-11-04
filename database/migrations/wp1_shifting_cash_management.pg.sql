-- ============================================================================
-- WP-1 Migration (PostgreSQL): Shifting & Cash Management
-- Purpose:
--   1. Add tblsystem_settings for store-level config (e.g., min_opening_float)
--   2. Add EOS breakdown & audit columns to tblshifts
--   3. Add notes column to tbldrawer_events
--   4. Add shift_id reference to tblsales
--   5. Close any stale unclosed shifts from prior dates
-- ============================================================================

BEGIN;

-- 1. System settings key-value table
CREATE TABLE IF NOT EXISTS tblsystem_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tblsystem_settings (setting_key, setting_value, description)
VALUES ('min_opening_float', '0.00', 'Minimum allowed opening cash float (PHP) when starting a shift')
ON CONFLICT (setting_key) DO NOTHING;

-- 2. Extend tblshifts with full End-of-Shift (EOS) reconciliation columns
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS floats_added_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS current_float DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS cash_sales_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS refunds_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS lifts_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS ar_sales_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS ar_sales_total DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS variance_amount DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS closed_by_supervisor_id INTEGER REFERENCES tblusers(user_id);
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS auth_log_id INTEGER REFERENCES tblauthorization_log(id);
ALTER TABLE tblshifts ADD COLUMN IF NOT EXISTS summary_json TEXT DEFAULT NULL;

-- 3. Extend tbldrawer_events with notes
ALTER TABLE tbldrawer_events ADD COLUMN IF NOT EXISTS notes VARCHAR(255) DEFAULT NULL;

-- 4. Link tblsales to tblshifts
ALTER TABLE tblsales ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES tblshifts(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON tblsales(shift_id);

-- 5. Close any stale open shifts from prior days so fresh logins prompt for float
UPDATE tblshifts
SET status = 'closed',
    closed_at = CURRENT_TIMESTAMP
WHERE status = 'open';

COMMIT;

-- ============================================================================
-- ROLLBACK NOTES (PostgreSQL):
-- BEGIN;
-- DROP INDEX IF EXISTS idx_sales_shift_id;
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
-- COMMIT;
-- ============================================================================

