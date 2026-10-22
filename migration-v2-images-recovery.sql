-- =====================================================================
-- MarketNest migration v2: product images + storage security
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste ALL -> Run.
-- SAFE TO RE-RUN. It never drops tables, never deletes products, never touches auth users.
-- Requires the existing public.products table (created by setup.sql).
-- =====================================================================

-- 1) Image column: stores the STORAGE PATH ("<user-id>/<file>.webp"), not the image itself.
alter table public.products add column if not exists image_path text;

-- 2) A listing may only point at an image inside its own seller's folder (database-level rule).
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'products_image_path_owner_check' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_image_path_owner_check
      check (image_path is null
             or (char_length(image_path) <= 200 and left(image_path, 37) = seller_id::text || '/'));
  end if;
end $$;

-- 3) Stop shop-name spoofing: on insert, seller_name is taken from the signed-in user's own
--    account (store_name) instead of trusting whatever the browser sent.
create or replace function public.set_product_seller_name()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare v_name text;
begin
  v_name := nullif(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'store_name', '')), '');
  if v_name is not null then
    new.seller_name := left(v_name, 60);
  end if;
  return new;
end;
$$;

drop trigger if exists products_set_seller_name on public.products;
create trigger products_set_seller_name
  before insert on public.products
  for each row execute function public.set_product_seller_name();

-- 4) Storage bucket "product-images": public READ, size and type limits enforced by Supabase itself.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,                                   -- exactly 2 MiB
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 5) Storage policies (on storage.objects). Re-runnable: drop then create.
--    Anonymous users get NO upload/update/delete/list rights. Public images are served
--    through the bucket's public URL, which does not need a policy.
drop policy if exists "product-images: sellers upload to own folder" on storage.objects;
create policy "product-images: sellers upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text      -- first folder must be the user's own id
  and array_length(storage.foldername(name), 1) = 1         -- exactly one folder level
  and name ~* '\.(jpe?g|png|webp)$'                         -- allowed extensions only
);

drop policy if exists "product-images: sellers read own folder" on storage.objects;
create policy "product-images: sellers read own folder"
on storage.objects for select
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "product-images: sellers delete own files" on storage.objects;
create policy "product-images: sellers delete own files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Intentionally NO update policy on storage.objects: nobody can overwrite an existing image.
-- Existing products-table policies (public read, own insert, own delete) are left exactly as they are.

-- 6) Verification (read-only). Check the results panel after running.
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'product-images';
select policyname, cmd, roles from pg_policies
where (schemaname = 'storage' and tablename = 'objects' and policyname like 'product-images:%')
   or (schemaname = 'public'  and tablename = 'products')
order by tablename, cmd;
