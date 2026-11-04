-- MySQL / MariaDB Revisions & Migration Script for XAMPP
-- Run against database: pos_ar_system

USE pos_ar_system;

-- 1. Ensure Supervisor Role exists in tblroles
INSERT INTO tblroles (role_id, role_name, description)
VALUES (5, 'Supervisor', 'Authorize voids, quantity overrides, drawer floats, and lifts')
ON DUPLICATE KEY UPDATE role_name = VALUES(role_name), description = VALUES(description);

-- 2. Ensure role column on tblusers
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'pos_ar_system' AND table_name = 'tblusers' AND column_name = 'role');
SET @alter_sql = IF(@col_exists = 0, 'ALTER TABLE tblusers ADD COLUMN role VARCHAR(30) DEFAULT ''cashier''', 'SELECT 1');
PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Seed / Update user accounts with standard defense credentials
-- Admin: admin / admin123
UPDATE tblusers SET password_hash = '$2y$10$jaAR6j2YsYAzfaxdQjL/QeC864VnBSH5WaqTvZZwrxAUuxg/F5xTa', role = 'admin', role_id = 1 WHERE username = 'admin';

-- Supervisor: supervisor / supervisor123
INSERT INTO tblusers (username, first_name, last_name, role_id, role, email, phone, password_hash, is_active)
SELECT 'supervisor', 'Supervisor', 'On-Duty', 5, 'supervisor', 'supervisor@pos.local', '09123456780', '$2y$10$m3B1DKe0IkcBX1Wn.W5XKuIcdNbQe/JT9mcws36jwFOkyBtvFq75m', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM tblusers WHERE username = 'supervisor');

UPDATE tblusers SET password_hash = '$2y$10$m3B1DKe0IkcBX1Wn.W5XKuIcdNbQe/JT9mcws36jwFOkyBtvFq75m', role = 'supervisor', role_id = 5 WHERE username = 'supervisor';

-- Cashier: cashier / cashier123
INSERT INTO tblusers (username, first_name, last_name, role_id, role, email, phone, password_hash, is_active)
SELECT 'cashier', 'Main', 'Cashier', 2, 'cashier', 'cashier@pos.local', '09123456781', '$2y$10$ISXggypQ4fCkuBPjzyj2nePf3mLEq/EaNWuVGsOINwlokr7j4gXkG', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM tblusers WHERE username = 'cashier');

UPDATE tblusers SET password_hash = '$2y$10$ISXggypQ4fCkuBPjzyj2nePf3mLEq/EaNWuVGsOINwlokr7j4gXkG', role = 'cashier', role_id = 2 WHERE username = 'cashier';

-- Maria (Cashier backup): maria / cashier123
UPDATE tblusers SET password_hash = '$2y$10$ISXggypQ4fCkuBPjzyj2nePf3mLEq/EaNWuVGsOINwlokr7j4gXkG', role = 'cashier', role_id = 2 WHERE username = 'maria';

-- AR Staff accounts use bcrypt (PASSWORD_DEFAULT, cost 10): ar_staff / ar123 and pedro / ar123.
INSERT INTO tblusers (username, first_name, last_name, role_id, role, email, phone, password_hash, is_active)
SELECT 'ar_staff', 'AR', 'Staff', 3, 'ar_staff', 'ar_staff@pos.local', '09123456782', '$2y$10$pNRHO.2Qzos90jlZZBrV1..bVvx3xOBQ4SCRLBdR1GH5Fm0n/hqgK', 1
FROM DUAL
ON DUPLICATE KEY UPDATE
  username = VALUES(username), role = VALUES(role), role_id = VALUES(role_id),
  password_hash = VALUES(password_hash), is_active = VALUES(is_active);

INSERT INTO tblusers (username, first_name, last_name, role_id, role, email, phone, password_hash, is_active)
SELECT 'pedro', 'Pedro', 'Reyes', 3, 'ar_staff', 'pedro@gmail.com', '09191234567', '$2y$10$pNRHO.2Qzos90jlZZBrV1..bVvx3xOBQ4SCRLBdR1GH5Fm0n/hqgK', 1
FROM DUAL
ON DUPLICATE KEY UPDATE
  username = VALUES(username), role = VALUES(role), role_id = VALUES(role_id),
  password_hash = VALUES(password_hash), is_active = VALUES(is_active);

-- Manager: RC / manager123
UPDATE tblusers SET password_hash = '$2y$10$roeHGi9SigrTjS2uwmWXIumc4Z7LVUKb8avljfeSqMd8zH8subz6W', role = 'manager', role_id = 4 WHERE username = 'RC';

-- 4. Ensure barcode column on tblproducts
SET @prod_col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'pos_ar_system' AND table_name = 'tblproducts' AND column_name = 'barcode');
SET @prod_alter_sql = IF(@prod_col_exists = 0, 'ALTER TABLE tblproducts ADD COLUMN barcode VARCHAR(64)', 'SELECT 1');
PREPARE prod_stmt FROM @prod_alter_sql;
EXECUTE prod_stmt;
DEALLOCATE PREPARE prod_stmt;

UPDATE tblproducts SET barcode = LPAD(product_id, 8, '0') WHERE barcode IS NULL OR barcode = '';

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = 'pos_ar_system' AND table_name = 'tblproducts' AND index_name = 'idx_products_barcode');
SET @idx_sql = IF(@idx_exists = 0, 'CREATE UNIQUE INDEX idx_products_barcode ON tblproducts(barcode)', 'SELECT 1');
PREPARE idx_stmt FROM @idx_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

-- 5. Table: tblauthorization_log
CREATE TABLE IF NOT EXISTS tblauthorization_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cashier_id INT NULL,
  supervisor_id INT NULL,
  action_type VARCHAR(50) NOT NULL,
  target_reference VARCHAR(100) NULL,
  shift_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_cashier (cashier_id),
  INDEX idx_auth_supervisor (supervisor_id),
  INDEX idx_auth_action (action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 6. Table: tblshifts
CREATE TABLE IF NOT EXISTS tblshifts (
  shift_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  terminal_id INT NULL,
  opening_cash DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  closing_cash DECIMAL(12, 2) NULL,
  expected_cash DECIMAL(12, 2) NULL,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  INDEX idx_shifts_user (user_id),
  INDEX idx_shifts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 7. Table: tbldrawer_events
CREATE TABLE IF NOT EXISTS tbldrawer_events (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  shift_id INT NULL,
  event_type VARCHAR(20) NOT NULL, -- 'float', 'lift', 'drop', 'sale'
  amount DECIMAL(12, 2) NOT NULL,
  authorized_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_drawer_shift (shift_id),
  INDEX idx_drawer_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 8. Table: tblpayment_allocations
CREATE TABLE IF NOT EXISTS tblpayment_allocations (
  allocation_id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  invoice_id INT NOT NULL,
  amount_applied DECIMAL(12, 2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alloc_payment (payment_id),
  INDEX idx_alloc_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 9. Table: tblheld_transactions (layout used by api/sales.php)
-- Drop the old layout (cart_data/held_at/...) only if it was created by an earlier version of this script.
SET @held_old = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'pos_ar_system' AND table_name = 'tblheld_transactions' AND column_name = 'cart_data');
SET @held_drop_sql = IF(@held_old > 0, 'DROP TABLE tblheld_transactions', 'SELECT 1');
PREPARE held_stmt FROM @held_drop_sql;
EXECUTE held_stmt;
DEALLOCATE PREPARE held_stmt;

CREATE TABLE IF NOT EXISTS tblheld_transactions (
  held_id INT AUTO_INCREMENT PRIMARY KEY,
  hold_reference VARCHAR(100) NOT NULL,
  cashier_user_id INT NOT NULL,
  customer_label VARCHAR(255) DEFAULT NULL,
  sale_type VARCHAR(50) DEFAULT 'Cash',
  items_json LONGTEXT NOT NULL,
  cart_state_json LONGTEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_held_cashier (cashier_user_id),
  INDEX idx_held_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 10. Table: tblwholesale_prices (used by api/wholesale_price.php)
CREATE TABLE IF NOT EXISTS tblwholesale_prices (
  wholesale_price_id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  wholesale_price DECIMAL(10, 2) DEFAULT NULL,
  price_tier VARCHAR(100) DEFAULT NULL,
  effective_from DATE DEFAULT NULL,
  effective_to DATE DEFAULT NULL,
  INDEX idx_wholesale_prices_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
