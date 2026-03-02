-- Private wallet storage per user (encrypted client-side)
create table if not exists user_private_wallets (
  id uuid primary key default gen_random_uuid(),
  user_address text not null,
  chain_id int not null,
  encrypted_wallet_blob text not null,       -- AES-GCM encrypted mnemonic + keys
  wallet_fingerprint text not null,          -- non-sensitive public identifier
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_private_wallet_user_chain unique (user_address, chain_id)
);

create index if not exists idx_private_wallets_user on user_private_wallets (user_address);

-- Extend invoices table for private payment tracking
alter table invoices
  add column if not exists payment_mode text not null default 'PUBLIC',
  add column if not exists private_payment_tx_ref text,
  add column if not exists payment_completed_at timestamptz;

-- Payment intents for pay-link flows
create table if not exists payment_intents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  chain_id int not null,
  allowed_modes text[] not null default '{PRIVATE,PUBLIC}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_intents_invoice on payment_intents (invoice_id);

-- Private payment receipts with optional encrypted memo
create table if not exists private_receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  payer_address text not null,
  receiver_address text not null,
  chain_id int not null,
  token_address text not null,
  amount numeric not null,
  private_tx_ref text,          -- RAILGUN internal tx reference (not a public tx hash)
  encrypted_memo_blob text,     -- optional AES-GCM encrypted memo for selective disclosure
  created_at timestamptz not null default now()
);

create index if not exists idx_private_receipts_invoice on private_receipts (invoice_id);
create index if not exists idx_private_receipts_payer on private_receipts (payer_address);
create index if not exists idx_private_receipts_receiver on private_receipts (receiver_address);

-- RLS policies for new tables
alter table user_private_wallets enable row level security;
alter table payment_intents enable row level security;
alter table private_receipts enable row level security;

create policy "Users can view own private wallets"
  on user_private_wallets for select using (true);

create policy "Users can insert own private wallets"
  on user_private_wallets for insert with check (true);

create policy "Users can update own private wallets"
  on user_private_wallets for update using (true);

create policy "Anyone can read payment intents"
  on payment_intents for select using (true);

create policy "Anyone can insert payment intents"
  on payment_intents for insert with check (true);

create policy "Anyone can read private receipts"
  on private_receipts for select using (true);

create policy "Anyone can insert private receipts"
  on private_receipts for insert with check (true);

-- Enable Realtime on private_receipts for live notifications
alter publication supabase_realtime add table private_receipts;
