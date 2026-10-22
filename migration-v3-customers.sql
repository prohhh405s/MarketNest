-- =====================================================================
-- MarketNest migration v3: customer accounts (saved items) + product descriptions
-- Run AFTER migration-v2-images-recovery.sql. Safe to re-run. Deletes nothing.
-- =====================================================================

-- 1) Optional product description (max 500 characters)
alter table public.products add column if not exists description text;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'products_description_len_check' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_description_len_check
      check (description is null or char_length(description) <= 500);
  end if;
end $$;

-- 2) Saved items (wishlist). One row = one user saved one product.
create table if not exists public.wishlist (
  user_id    uuid not null references auth.users(id)     on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists wishlist_user_idx on public.wishlist (user_id);

alter table public.wishlist enable row level security;

-- Each person can see, add and remove ONLY their own saved items. Anonymous users get nothing.
drop policy if exists "wishlist: read own" on public.wishlist;
create policy "wishlist: read own" on public.wishlist
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "wishlist: add own" on public.wishlist;
create policy "wishlist: add own" on public.wishlist
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "wishlist: remove own" on public.wishlist;
create policy "wishlist: remove own" on public.wishlist
  for delete to authenticated using (auth.uid() = user_id);

-- 3) Verification (read-only)
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'products' and column_name in ('image_path', 'description');
select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'wishlist' order by cmd;
