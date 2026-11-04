-- Migration: Add status column to tblheld_transactions for EOS auto-discard audit trail
ALTER TABLE tblheld_transactions ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'HELD';
CREATE INDEX idx_held_status ON tblheld_transactions (shift_id, cashier_user_id, status);

