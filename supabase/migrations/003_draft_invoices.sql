-- Draft invoice support: allow invoices to exist in Supabase before being published on-chain

-- Allow chain_invoice_id to be NULL (drafts have no on-chain ID)
ALTER TABLE invoices ALTER COLUMN chain_invoice_id DROP NOT NULL;

-- New columns for richer invoice metadata
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Recreate unique index only for published invoices (drafts have null chain_invoice_id)
DROP INDEX IF EXISTS idx_invoices_chain;
CREATE UNIQUE INDEX idx_invoices_chain ON invoices (chain_id, chain_invoice_id) WHERE chain_invoice_id IS NOT NULL;

-- Allow deleting invoices (drafts)
CREATE POLICY "Anyone can delete invoices" ON invoices FOR DELETE USING (true);
