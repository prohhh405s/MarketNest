-- MarketNest v4: stock, secure demo orders, reviews, messaging, notifications, reports and admin moderation.
-- Run after setup.sql, migration-v2-images-recovery.sql and migration-v3-customers.sql.
-- Designed to be re-runnable and preserve existing data. Does not process payments.

-- Product inventory + update policy: sellers may update their own listings, but cannot transfer ownership.
alter table public.products add column if not exists stock integer not null default 10;
alter table public.products add column if not exists updated_at timestamptz not null default now();
alter table public.products add column if not exists is_active boolean not null default true;
do $$ begin
 if not exists (select 1 from pg_constraint where conname='products_stock_check' and conrelid='public.products'::regclass) then
  alter table public.products add constraint products_stock_check check (stock between 0 and 100000);
 end if;
end $$;
drop policy if exists "Sellers can update their own products" on public.products;
create policy "Sellers can update their own products" on public.products for update to authenticated
 using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

-- Admin membership is managed ONLY by the project owner in SQL, never by a website signup.
create table if not exists public.marketnest_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.marketnest_admins enable row level security;
revoke all on public.marketnest_admins from anon, authenticated;
create or replace function public.marketnest_is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
 select exists(select 1 from public.marketnest_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.marketnest_is_admin() from public;
grant execute on function public.marketnest_is_admin() to anon, authenticated;

drop policy if exists "Anyone can read published products" on public.products;
create policy "Anyone can read published products" on public.products for select to anon,authenticated using (is_active=true or auth.uid()=seller_id or public.marketnest_is_admin());

-- Private user directory for admin account moderation. Roles in metadata are display-only; admin status is separate.
create table if not exists public.marketnest_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null default '', display_name text not null default '', account_type text not null default 'customer' check(account_type in ('customer','seller')),
 suspended boolean not null default false, created_at timestamptz not null default now()
);
alter table public.marketnest_profiles enable row level security;
revoke all on public.marketnest_profiles from anon;
grant select on public.marketnest_profiles to authenticated;
revoke insert, delete on public.marketnest_profiles from anon, authenticated;
revoke update on public.marketnest_profiles from anon, authenticated;
grant update(suspended) on public.marketnest_profiles to authenticated;
drop policy if exists "profiles read own or admin" on public.marketnest_profiles;
create policy "profiles read own or admin" on public.marketnest_profiles for select to authenticated using(user_id=auth.uid() or public.marketnest_is_admin());
drop policy if exists "admins suspend users" on public.marketnest_profiles;
create policy "admins suspend users" on public.marketnest_profiles for update to authenticated using(public.marketnest_is_admin() and user_id <> auth.uid()) with check(public.marketnest_is_admin() and user_id <> auth.uid());
create or replace function public.marketnest_sync_profile()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_type text; v_name text;
begin
 v_type := case when new.raw_user_meta_data->>'account_type'='seller' then 'seller' else 'customer' end;
 v_name := left(coalesce(nullif(trim(new.raw_user_meta_data->>'store_name'),''),nullif(trim(new.raw_user_meta_data->>'display_name'),''),''),60);
 insert into public.marketnest_profiles(user_id,email,display_name,account_type)
 values(new.id,coalesce(new.email,''),v_name,v_type)
 on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name,account_type=excluded.account_type;
 return new;
end; $$;
drop trigger if exists marketnest_auth_profile_sync on auth.users;
create trigger marketnest_auth_profile_sync after insert or update of email,raw_user_meta_data on auth.users for each row execute function public.marketnest_sync_profile();
insert into public.marketnest_profiles(user_id,email,display_name,account_type)
 select id,coalesce(email,''),left(coalesce(nullif(trim(raw_user_meta_data->>'store_name'),''),nullif(trim(raw_user_meta_data->>'display_name'),''),''),60),case when raw_user_meta_data->>'account_type'='seller' then 'seller' else 'customer' end from auth.users
on conflict(user_id) do nothing;
create or replace function public.marketnest_is_suspended(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when p_user_id=auth.uid() or public.marketnest_is_admin()
   then exists(select 1 from public.marketnest_profiles p where p.user_id=p_user_id and p.suspended=true)
   else true end;
$$;
revoke all on function public.marketnest_is_suspended(uuid) from public;
grant execute on function public.marketnest_is_suspended(uuid) to authenticated;

-- Sellers can only mutate their own listings while their account is active.
drop policy if exists "Sellers can insert their own products" on public.products;
create policy "Sellers can insert their own products" on public.products for insert to authenticated
 with check(auth.uid()=seller_id and not public.marketnest_is_suspended(auth.uid()));
drop policy if exists "Sellers can delete their own products" on public.products;
create policy "Sellers can delete their own products" on public.products for delete to authenticated
 using(auth.uid()=seller_id and not public.marketnest_is_suspended(auth.uid()));
drop policy if exists "Sellers can update their own products" on public.products;
create policy "Sellers can update their own products" on public.products for update to authenticated
 using(auth.uid()=seller_id and not public.marketnest_is_suspended(auth.uid()))
 with check(auth.uid()=seller_id and not public.marketnest_is_suspended(auth.uid()));

-- Suspended accounts cannot upload or delete product photos.
drop policy if exists "product-images: sellers upload to own folder" on storage.objects;
create policy "product-images: sellers upload to own folder" on storage.objects for insert to authenticated
 with check(bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text and array_length(storage.foldername(name),1)=1 and name ~* '\.(jpe?g|png|webp)$' and not public.marketnest_is_suspended(auth.uid()));
drop policy if exists "product-images: sellers delete own files" on storage.objects;
create policy "product-images: sellers delete own files" on storage.objects for delete to authenticated
 using(bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text and not public.marketnest_is_suspended(auth.uid()));

-- Orders and line items. A customer order is demo-only; prices and stock are calculated server-side.
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references auth.users(id) on delete restrict,
 total_amount bigint not null default 0 check (total_amount >= 0),
 status text not null default 'placed' check (status in ('placed','cancelled','completed')),
 created_at timestamptz not null default now()
);
create index if not exists orders_buyer_idx on public.orders(buyer_id, created_at desc);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete restrict,
 seller_id uuid not null references auth.users(id) on delete restrict,
 product_name text not null,
 unit_price integer not null check (unit_price > 0),
 quantity integer not null check (quantity between 1 and 99),
 status text not null default 'placed' check (status in ('placed','processing','shipped','delivered','cancelled')),
 created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_seller_idx on public.order_items(seller_id, created_at desc);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
-- Security-definer membership helpers avoid circular RLS checks between orders and order_items.
create or replace function public.marketnest_seller_has_order(p_order_id uuid, p_seller_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_seller_id=auth.uid() and exists(select 1 from public.order_items i where i.order_id=p_order_id and i.seller_id=p_seller_id);
$$;
create or replace function public.marketnest_user_bought_order(p_order_id uuid, p_buyer_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_buyer_id=auth.uid() and exists(select 1 from public.orders o where o.id=p_order_id and o.buyer_id=p_buyer_id);
$$;
revoke all on function public.marketnest_seller_has_order(uuid,uuid) from public;
revoke all on function public.marketnest_user_bought_order(uuid,uuid) from public;
grant execute on function public.marketnest_seller_has_order(uuid,uuid) to authenticated;
grant execute on function public.marketnest_user_bought_order(uuid,uuid) to authenticated;
drop policy if exists "orders buyer or admin read" on public.orders;
create policy "orders buyer or admin read" on public.orders for select to authenticated
 using (buyer_id = auth.uid() or public.marketnest_is_admin() or public.marketnest_seller_has_order(orders.id,auth.uid()));
drop policy if exists "order items buyer seller admin read" on public.order_items;
create policy "order items buyer seller admin read" on public.order_items for select to authenticated
 using (seller_id=auth.uid() or public.marketnest_is_admin() or public.marketnest_user_bought_order(order_items.order_id,auth.uid()));
drop policy if exists "seller updates own order item status" on public.order_items;
create policy "seller updates own order item status" on public.order_items for update to authenticated
 using ((seller_id=auth.uid() and not public.marketnest_is_suspended(auth.uid())) or public.marketnest_is_admin()) with check ((seller_id=auth.uid() and not public.marketnest_is_suspended(auth.uid())) or public.marketnest_is_admin());
-- Restrict client updates to the status column only; immutable order snapshots stay protected.
revoke update on public.order_items from anon, authenticated;
grant update(status) on public.order_items to authenticated;
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, delete on public.order_items from anon, authenticated;
grant select on public.orders, public.order_items to authenticated;
-- No direct INSERT policies: orders can only be created through the validated RPC below.

create or replace function public.marketnest_place_order(p_items jsonb)
returns uuid language plpgsql security definer set search_path=public, pg_temp as $$
declare
 v_buyer uuid := auth.uid(); v_order uuid; v_total bigint := 0; v_item record; v_product public.products%rowtype; v_qty integer; v_count integer := 0;
begin
 if v_buyer is null then raise exception 'Please sign in before placing an order.'; end if;
 if public.marketnest_is_suspended(v_buyer) then raise exception 'This account is suspended from marketplace activity.'; end if;
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'Cart must contain 1 to 30 different products.'; end if;
 insert into public.orders(buyer_id,total_amount,status) values(v_buyer,0,'placed') returning id into v_order;
 for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer) loop
  v_count := v_count + 1; v_qty := v_item.quantity;
  if v_item.product_id is null or v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'Invalid product or quantity.'; end if;
  if exists(select 1 from public.order_items where order_id=v_order and product_id=v_item.product_id) then raise exception 'Duplicate product in cart.'; end if;
  select * into v_product from public.products where id=v_item.product_id for update;
  if not found or not v_product.is_active then raise exception 'A product in your cart is no longer available.'; end if;
  if v_product.seller_id = v_buyer then raise exception 'You cannot order your own listing.'; end if;
  if exists(select 1 from public.marketnest_profiles mp where mp.user_id=v_product.seller_id and mp.suspended=true) then raise exception 'This seller is not currently accepting orders.'; end if;
  if v_product.stock < v_qty then raise exception 'Not enough stock for: %', v_product.name; end if;
  update public.products set stock=stock-v_qty, updated_at=now() where id=v_product.id;
  insert into public.order_items(order_id,product_id,seller_id,product_name,unit_price,quantity,status)
   values(v_order,v_product.id,v_product.seller_id,v_product.name,v_product.price,v_qty,'placed');
  v_total := v_total + (v_product.price::bigint * v_qty);
 end loop;
 update public.orders set total_amount=v_total where id=v_order;
 return v_order;
exception when others then
 -- Raising an exception rolls back the entire function transaction, including stock changes.
 raise;
end; $$;
revoke all on function public.marketnest_place_order(jsonb) from public, anon;
grant execute on function public.marketnest_place_order(jsonb) to authenticated;

-- Reviews: one review per buyer per product, only after a delivered order line.
create table if not exists public.reviews (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 buyer_id uuid not null references auth.users(id) on delete cascade,
 order_item_id uuid not null unique references public.order_items(id) on delete cascade,
 rating integer not null check (rating between 1 and 5), body text not null default '' check (char_length(body) <= 1000),
 created_at timestamptz not null default now(), unique(product_id,buyer_id)
);
create index if not exists reviews_product_idx on public.reviews(product_id,created_at desc);
alter table public.reviews enable row level security;
drop policy if exists "reviews public read" on public.reviews;
create policy "reviews public read" on public.reviews for select to anon,authenticated using (true);
drop policy if exists "verified buyer adds review" on public.reviews;
create policy "verified buyer adds review" on public.reviews for insert to authenticated with check (
 buyer_id=auth.uid() and not public.marketnest_is_suspended(auth.uid()) and exists(select 1 from public.order_items i where i.id=order_item_id and i.product_id=reviews.product_id and i.status='delivered')
 and exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where i.id=order_item_id and o.buyer_id=auth.uid())
);
drop policy if exists "admin moderates reviews" on public.reviews;
create policy "admin moderates reviews" on public.reviews for delete to authenticated using (public.marketnest_is_admin());
-- Public may see review content, but never buyer IDs or order-item IDs.
revoke all on public.reviews from anon, authenticated;
grant select(id,product_id,rating,body,created_at) on public.reviews to anon, authenticated;
grant insert(product_id,buyer_id,order_item_id,rating,body) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
create or replace function public.marketnest_my_reviewed_purchases()
returns table(product_id uuid, order_item_id uuid) language sql stable security definer set search_path=public,pg_temp as $$
 select r.product_id,r.order_item_id from public.reviews r where r.buyer_id=auth.uid();
$$;
revoke all on function public.marketnest_my_reviewed_purchases() from public;
grant execute on function public.marketnest_my_reviewed_purchases() to authenticated;

-- Buyer/seller messages: insert allowed only for buyer with an order, or the product's seller.
create table if not exists public.marketnest_messages (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade, recipient_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(trim(body)) between 1 and 2000), created_at timestamptz not null default now(), read_at timestamptz,
 check(sender_id <> recipient_id)
);
create index if not exists mn_messages_pair_idx on public.marketnest_messages(sender_id,recipient_id,created_at desc);
alter table public.marketnest_messages enable row level security;
drop policy if exists "message participants read" on public.marketnest_messages;
create policy "message participants read" on public.marketnest_messages for select to authenticated using (auth.uid() in (sender_id,recipient_id) or public.marketnest_is_admin());
drop policy if exists "message participant sends valid message" on public.marketnest_messages;
create policy "message participant sends valid message" on public.marketnest_messages for insert to authenticated with check (
 sender_id=auth.uid() and not public.marketnest_is_suspended(auth.uid()) and (
  (recipient_id=(select p.seller_id from public.products p where p.id=marketnest_messages.product_id)
   and exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=marketnest_messages.product_id and o.buyer_id=auth.uid()))
  or
  (exists(select 1 from public.products p where p.id=marketnest_messages.product_id and p.seller_id=auth.uid())
   and exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=marketnest_messages.product_id and o.buyer_id=marketnest_messages.recipient_id))
 )
);
drop policy if exists "recipient marks message read" on public.marketnest_messages;
create policy "recipient marks message read" on public.marketnest_messages for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
revoke all on public.marketnest_messages from anon, authenticated;
grant select, insert on public.marketnest_messages to authenticated;
grant update(read_at) on public.marketnest_messages to authenticated;

-- Notifications: only recipient can read/mark read; rows are generated by database triggers/functions.
create table if not exists public.marketnest_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null, message text not null check(char_length(message)<=500), link text not null default '#',
 created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists mn_notifications_user_idx on public.marketnest_notifications(user_id,created_at desc);
alter table public.marketnest_notifications enable row level security;
drop policy if exists "notifications read own" on public.marketnest_notifications;
create policy "notifications read own" on public.marketnest_notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists "notifications mark own read" on public.marketnest_notifications;
create policy "notifications mark own read" on public.marketnest_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke insert, delete, update on public.marketnest_notifications from anon, authenticated;
grant select on public.marketnest_notifications to authenticated;
grant update(read_at) on public.marketnest_notifications to authenticated;

create or replace function public.marketnest_notify_order_item()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_buyer uuid;
begin
 select buyer_id into v_buyer from public.orders where id=new.order_id;
 if tg_op='UPDATE' then
  if old.status in ('cancelled','delivered') and new.status is distinct from old.status then
   raise exception 'This order item is already in a final state.';
  end if;
  if new.status='cancelled' and old.status <> 'cancelled' then
   update public.products set stock=least(100000,stock+old.quantity),updated_at=now() where id=old.product_id;
  end if;
 end if;
 if tg_op='INSERT' then
  insert into public.marketnest_notifications(user_id,kind,message,link) values(v_buyer,'order','Your order for '||new.product_name||' was placed.','#orders');
  insert into public.marketnest_notifications(user_id,kind,message,link) values(new.seller_id,'order','New order received for '||new.product_name||'.','#features');
 elsif old.status is distinct from new.status then
  insert into public.marketnest_notifications(user_id,kind,message,link) values(v_buyer,'order','Order update: '||new.product_name||' is now '||new.status||'.','#orders');
 end if;
 return new;
end; $$;
drop trigger if exists marketnest_order_item_notify on public.order_items;
create trigger marketnest_order_item_notify after insert or update of status on public.order_items for each row execute function public.marketnest_notify_order_item();

create or replace function public.marketnest_notify_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.marketnest_notifications(user_id,kind,message,link) values(new.recipient_id,'message','You received a new MarketNest message.','#features'); return new;
end; $$;
drop trigger if exists marketnest_message_notify on public.marketnest_messages;
create trigger marketnest_message_notify after insert on public.marketnest_messages for each row execute function public.marketnest_notify_message();

-- Reports: anyone signed in can submit; only admins can review/update/delete.
create table if not exists public.marketnest_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid references public.products(id) on delete set null, message_id uuid references public.marketnest_messages(id) on delete set null,
 reason text not null check(char_length(trim(reason)) between 5 and 1000), status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
 created_at timestamptz not null default now(), check(product_id is not null or message_id is not null)
);
alter table public.marketnest_reports drop constraint if exists marketnest_reports_check;
alter table public.marketnest_reports enable row level security;
drop policy if exists "reporter reads own reports" on public.marketnest_reports;
create policy "reporter reads own reports" on public.marketnest_reports for select to authenticated using(reporter_id=auth.uid() or public.marketnest_is_admin());
drop policy if exists "signed in reports content" on public.marketnest_reports;
create policy "signed in reports content" on public.marketnest_reports for insert to authenticated with check(reporter_id=auth.uid() and not public.marketnest_is_suspended(auth.uid()));
drop policy if exists "admin manages reports" on public.marketnest_reports;
create policy "admin manages reports" on public.marketnest_reports for update to authenticated using(public.marketnest_is_admin()) with check(public.marketnest_is_admin());
drop policy if exists "admin deletes reports" on public.marketnest_reports;
create policy "admin deletes reports" on public.marketnest_reports for delete to authenticated using(public.marketnest_is_admin());

-- Admins may moderate product listings; normal sellers remain limited to their own rows.
drop policy if exists "admins delete products" on public.products;
create policy "admins delete products" on public.products for delete to authenticated using(public.marketnest_is_admin());
drop policy if exists "admins update products" on public.products;
create policy "admins update products" on public.products for update to authenticated using(public.marketnest_is_admin()) with check(public.marketnest_is_admin());

-- Verification queries
select table_name from information_schema.tables where table_schema='public' and table_name in ('orders','order_items','reviews','marketnest_messages','marketnest_notifications','marketnest_reports','marketnest_admins','marketnest_profiles') order by table_name;
select policyname,cmd from pg_policies where schemaname='public' and tablename in ('products','orders','order_items','reviews','marketnest_messages','marketnest_notifications','marketnest_reports') order by tablename,cmd;
