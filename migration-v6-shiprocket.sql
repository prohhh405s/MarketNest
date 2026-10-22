-- MarketNest v6: shipping/COD metadata foundation for Shiprocket.
-- Run only after setup.sql and migrations v2, v3, v4, and v5 have succeeded.
-- This migration does NOT call Shiprocket, create live shipments, or charge payments.

alter table public.orders
  add column if not exists payment_method text not null default 'demo',
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists shipping_address jsonb,
  add column if not exists shipping_status text not null default 'not_created',
  add column if not exists shipping_provider text,
  add column if not exists shiprocket_order_id bigint,
  add column if not exists shiprocket_shipment_id bigint,
  add column if not exists shiprocket_awb text,
  add column if not exists shiprocket_courier text,
  add column if not exists tracking_url text,
  add column if not exists shipping_error text,
  add column if not exists parcel_weight_kg numeric(8,3) not null default 0.5,
  add column if not exists parcel_length_cm numeric(8,2) not null default 20,
  add column if not exists parcel_breadth_cm numeric(8,2) not null default 15,
  add column if not exists parcel_height_cm numeric(8,2) not null default 10;

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('demo','online','cod'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('not_required','pending','paid','cod_pending','cod_collected','failed','refunded'));
alter table public.orders drop constraint if exists orders_shipping_status_check;
alter table public.orders add constraint orders_shipping_status_check
  check (shipping_status in ('not_created','dry_run_ready','created','pickup_scheduled','in_transit','out_for_delivery','delivered','rto','cancelled','exception'));
alter table public.orders drop constraint if exists orders_parcel_dimensions_check;
alter table public.orders add constraint orders_parcel_dimensions_check
  check (parcel_weight_kg > 0 and parcel_length_cm > 0 and parcel_breadth_cm > 0 and parcel_height_cm > 0);

create table if not exists public.marketnest_shipping_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'shiprocket',
  event_status text not null,
  event_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create index if not exists marketnest_shipping_events_order_idx
  on public.marketnest_shipping_events(order_id, received_at desc);
create index if not exists orders_shiprocket_awb_idx on public.orders(shiprocket_awb) where shiprocket_awb is not null;
alter table public.marketnest_shipping_events enable row level security;
revoke all on public.marketnest_shipping_events from anon, authenticated;
grant select on public.marketnest_shipping_events to authenticated;
drop policy if exists "shipping events visible to order parties" on public.marketnest_shipping_events;
create policy "shipping events visible to order parties" on public.marketnest_shipping_events
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id=order_id and (o.buyer_id=auth.uid() or public.marketnest_is_admin()))
    or exists (select 1 from public.order_items i where i.order_id=order_id and i.seller_id=auth.uid())
  );

-- Protect shipping/payment fields from direct browser writes. Edge Functions use the service role.
revoke update on public.orders from anon, authenticated;
-- Existing v4 grants select only on orders, so this is defensive and documents the boundary.
grant select on public.orders to authenticated;

select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='orders'
  and column_name in ('payment_method','payment_status','shipping_address','shipping_status','shiprocket_awb')
order by column_name;
