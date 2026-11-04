-- ============================================================================
-- WP-2 MIGRATION (MySQL / MariaDB XAMPP): Terminal & Cashier Binding
-- ============================================================================

-- 1. Extend tblpos_terminals with machine registry fields
ALTER TABLE tblpos_terminals
  ADD COLUMN IF NOT EXISTS machine_identifier VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS device_token VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;

-- 2. Extend tblusers with assigned_terminal_id for Cashier lock
ALTER TABLE tblusers
  ADD COLUMN IF NOT EXISTS assigned_terminal_id INT(11) NULL;

-- 3. Seed default localhost terminal setting in tblsystem_settings
INSERT IGNORE INTO tblsystem_settings (setting_key, setting_value)
VALUES ('default_localhost_terminal_id', '1');

-- 4. Ensure at least 2 terminals exist and have deterministic machine identifiers & tokens
UPDATE tblpos_terminals
SET machine_identifier = COALESCE(NULLIF(machine_identifier, ''), 'TERM-01'),
    device_token       = COALESCE(NULLIF(device_token, ''), 'TOKEN-TERM-1'),
    ip_address         = COALESCE(NULLIF(ip_address, ''), '127.0.0.1'),
    is_active          = 1
WHERE pos_terminal_id = 1;

INSERT IGNORE INTO tblpos_terminals (pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, is_active)
VALUES (2, 'Counter 2', 'TERM-02', 'TOKEN-TERM-2', '127.0.0.2', 1);

UPDATE tblpos_terminals
SET machine_identifier = COALESCE(NULLIF(machine_identifier, ''), 'TERM-02'),
    device_token       = COALESCE(NULLIF(device_token, ''), 'TOKEN-TERM-2'),
    ip_address         = COALESCE(NULLIF(ip_address, ''), '127.0.0.2'),
    is_active          = 1
WHERE pos_terminal_id = 2;

-- 5. Bind default cashier accounts to their dedicated terminals:
--    - 'cashier' (Main Cashier, user_id=6) -> Terminal 1 (Counter 1)
--    - 'maria'   (Maria Santos, user_id=2) -> Terminal 2 (Counter 2)
--    - Supervisors / Admins / Managers / AR Staff remain NULL (exempt)
UPDATE tblusers SET assigned_terminal_id = 1 WHERE LOWER(username) = 'cashier';
UPDATE tblusers SET assigned_terminal_id = 2 WHERE LOWER(username) = 'maria';

-- ============================================================================
-- ROLLBACK NOTES (MySQL / MariaDB)
-- ============================================================================
-- ALTER TABLE tblusers DROP COLUMN IF EXISTS assigned_terminal_id;
-- ALTER TABLE tblpos_terminals
--   DROP COLUMN IF EXISTS machine_identifier,
--   DROP COLUMN IF EXISTS device_token,
--   DROP COLUMN IF EXISTS ip_address,
--   DROP COLUMN IF EXISTS is_active;
-- DELETE FROM tblsystem_settings WHERE setting_key = 'default_localhost_terminal_id';

