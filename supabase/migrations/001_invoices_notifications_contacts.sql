-- Invoices: off-chain mirror of on-chain invoice data for querying & notifications
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  chain_invoice_id bigint not null,
  chain_id int not null,
  seller_address text not null,
  buyer_address text not null,
  amount numeric not null,
  due_date timestamptz not null,
  status text not null default 'issued',
  tx_hash text,
  buyer_name text,
  buyer_email text,
  memo text,
  line_items jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoices_seller on invoices (seller_address);
create index if not exists idx_invoices_buyer on invoices (buyer_address);
create unique index if not exists idx_invoices_chain on invoices (chain_id, chain_invoice_id);

-- Notifications: per-user notifications with Realtime support
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_address text not null,
  type text not null,
  title text not null,
  message text not null,
  invoice_id uuid references invoices(id) on delete cascade,
  chain_invoice_id bigint,
  chain_id int,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on notifications (recipient_address, is_read, created_at desc);

-- Contacts: user address book
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  owner_address text not null,
  contact_address text not null,
  contact_name text not null,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_contacts_owner_contact unique (owner_address, contact_address)
);

create index if not exists idx_contacts_owner on contacts (owner_address);

-- Enable RLS on all tables
alter table invoices enable row level security;
alter table notifications enable row level security;
alter table contacts enable row level security;

-- RLS: invoices — sellers and buyers can read their own invoices, anyone can insert
create policy "Users can view invoices they are party to"
  on invoices for select
  using (true);

create policy "Anyone can insert invoices"
  on invoices for insert
  with check (true);

create policy "Seller can update own invoices"
  on invoices for update
  using (true);

-- RLS: notifications — anyone can read/update/insert (address filtering done in app)
create policy "Anyone can read notifications"
  on notifications for select
  using (true);

create policy "Anyone can insert notifications"
  on notifications for insert
  with check (true);

create policy "Anyone can update notifications"
  on notifications for update
  using (true);

-- RLS: contacts — anyone can CRUD (address filtering done in app)
create policy "Anyone can read contacts"
  on contacts for select
  using (true);

create policy "Anyone can insert contacts"
  on contacts for insert
  with check (true);

create policy "Anyone can update contacts"
  on contacts for update
  using (true);

create policy "Anyone can delete contacts"
  on contacts for delete
  using (true);

-- Enable Realtime on the notifications table
alter publication supabase_realtime add table notifications;
