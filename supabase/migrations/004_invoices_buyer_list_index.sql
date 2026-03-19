-- Speed up buyer dashboard list (filters buyer_address, is_draft, status; orders by created_at)
-- Reduces full scans and helps avoid gateway timeouts on large tables.
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_active_list
  ON invoices (buyer_address, created_at DESC)
  WHERE is_draft = false AND COALESCE(status, '') <> 'rejected';
