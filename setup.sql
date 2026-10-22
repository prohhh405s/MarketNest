-- MarketNest seller-account setup
-- Run this entire file in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- This SQL creates a products table with database-enforced seller ownership.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  price integer not null check (price between 1 and 1000000),
  category text not null check (category in ('Electronics', 'Home', 'Fashion', 'Books', 'Beauty & Personal Care', 'Sports & Outdoors', 'Toys & Games', 'Grocery', 'Health & Wellness', 'Automotive', 'Pet Supplies', 'Garden & Outdoors', 'Stationery & Office', 'Kitchen & Dining')),
  emoji text not null default '📦' check (char_length(emoji) <= 8),
  seller_name text not null default 'MarketNest seller' check (char_length(seller_name) <= 60),
  created_at timestamptz not null default now()
);

create index if not exists products_created_at_idx on public.products (created_at desc);
create index if not exists products_seller_id_idx on public.products (seller_id);

alter table public.products enable row level security;

-- Visitors can read published listings.
drop policy if exists "Anyone can read published products" on public.products;
create policy "Anyone can read published products"
on public.products for select
to anon, authenticated
using (true);

-- A signed-in user can insert only a row whose seller_id is their own auth ID.
drop policy if exists "Sellers can insert their own products" on public.products;
create policy "Sellers can insert their own products"
on public.products for insert
to authenticated
with check (auth.uid() = seller_id);

-- A seller can delete only their own products.
drop policy if exists "Sellers can delete their own products" on public.products;
create policy "Sellers can delete their own products"
on public.products for delete
to authenticated
using (auth.uid() = seller_id);

-- No update policy is intentionally added yet. Sellers cannot update rows until you
-- deliberately add a matching UPDATE policy. This keeps the first version smaller
-- and reduces accidental access.
