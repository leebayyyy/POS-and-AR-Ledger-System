-- ============================================================================
-- WP-5 Migration (MySQL / MariaDB): AR Overdue Policies + Credit/Debit Memos
-- ============================================================================
-- Forward Migration:
-- 1. Create tblar_ledger_entries for explicit auditable Credit Memos, Debit Memos,
--    Overdue Interest, and Overdue Penalty adjustments.
-- 2. Add principal_amount to tblar_invoice to track base principal for overdue math.
-- 3. Seed configurable AR Overdue Policy settings in tblsystem_settings.
-- ============================================================================

ALTER TABLE tblar_invoice
  ADD COLUMN IF NOT EXISTS principal_amount DECIMAL(12,2) NULL;

UPDATE tblar_invoice
SET principal_amount = invoice_amount
WHERE principal_amount IS NULL;

CREATE TABLE IF NOT EXISTS tblar_ledger_entries (
  entry_id INT AUTO_INCREMENT PRIMARY KEY,
  entry_number VARCHAR(50) NOT NULL UNIQUE,
  ar_customer_id INT NOT NULL,
  ar_invoice_id INT NULL,
  shift_id INT NULL,
  entry_type VARCHAR(30) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  reference_no VARCHAR(100) NOT NULL,
  interest_mode VARCHAR(20) NULL,
  interest_rate_pct DECIMAL(6,2) NULL,
  days_overdue INT NULL,
  periods_applied INT NULL,
  balance_before DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_after DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  authorized_by_supervisor_id INT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ar_ledger_customer (ar_customer_id, created_at),
  INDEX idx_ar_ledger_invoice (ar_invoice_id),
  INDEX idx_ar_ledger_shift (shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tblsystem_settings (setting_key, setting_value)
VALUES
  ('ar_default_term_days', '30'),
  ('ar_interest_mode', 'fixed'),
  ('ar_interest_rate_pct', '5.00'),
  ('ar_penalty_mode', 'flat'),
  ('ar_penalty_value', '50.00'),
  ('ar_block_overdue_accounts', '1')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- ============================================================================
-- Rollback Notes (MySQL / MariaDB):
-- DROP TABLE IF EXISTS tblar_ledger_entries;
-- ALTER TABLE tblar_invoice DROP COLUMN IF EXISTS principal_amount;
-- DELETE FROM tblsystem_settings WHERE setting_key IN (
--   'ar_default_term_days', 'ar_interest_mode', 'ar_interest_rate_pct',
--   'ar_penalty_mode', 'ar_penalty_value', 'ar_block_overdue_accounts'
-- );
-- ============================================================================

