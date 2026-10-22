-- MarketNest category expansion (v5)
-- Run after migration-v4-marketplace.sql. Safe to rerun.
-- Existing product rows are preserved; the category allow-list is expanded.

alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check
  check (category in (
    'Electronics', 'Home', 'Fashion', 'Books',
    'Beauty & Personal Care', 'Sports & Outdoors', 'Toys & Games', 'Grocery',
    'Health & Wellness', 'Automotive', 'Pet Supplies', 'Garden & Outdoors',
    'Stationery & Office', 'Kitchen & Dining'
  ));
