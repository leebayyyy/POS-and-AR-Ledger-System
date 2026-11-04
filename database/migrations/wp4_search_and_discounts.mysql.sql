-- ============================================================================
-- WP-4 Migration (MySQL / MariaDB): Search & PH-Standard Discounts (RA 9994 / RA 10754)
-- ============================================================================
-- Forward Migration:
-- 1. Add PH-standard statutory (Senior/PWD) & custom discount columns to tblsales.
-- 2. Seed custom discount supervisor gate thresholds in tblsystem_settings.
-- ============================================================================

ALTER TABLE tblsales
  ADD COLUMN IF NOT EXISTS discount_type VARCHAR(30) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_id_number VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS vat_exempt_sales DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS vat_exempt_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS custom_discount_mode VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS custom_discount_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_supervisor_id INT NULL;

INSERT INTO tblsystem_settings (setting_key, setting_value)
VALUES
  ('custom_discount_threshold_pct', '10'),
  ('custom_discount_threshold_amt', '100.00')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- ============================================================================
-- Rollback Notes (MySQL / MariaDB):
-- ALTER TABLE tblsales
--   DROP COLUMN IF EXISTS discount_supervisor_id,
--   DROP COLUMN IF EXISTS custom_discount_value,
--   DROP COLUMN IF EXISTS custom_discount_mode,
--   DROP COLUMN IF EXISTS discount_total,
--   DROP COLUMN IF EXISTS vat_exempt_amount,
--   DROP COLUMN IF EXISTS vat_exempt_sales,
--   DROP COLUMN IF EXISTS discount_id_number,
--   DROP COLUMN IF EXISTS discount_type;
-- DELETE FROM tblsystem_settings WHERE setting_key IN ('custom_discount_threshold_pct', 'custom_discount_threshold_amt');
-- ============================================================================

