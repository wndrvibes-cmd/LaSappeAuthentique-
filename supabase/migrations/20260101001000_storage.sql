-- ============================================================================
-- 0010 — Buckets Supabase Storage et politiques d'accès
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true,  10485760,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('category-images','category-images', true,  10485760,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('brand-assets',   'brand-assets',    true,  10485760,
   array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']),
  ('exports',        'exports',         false, 52428800,
   array['text/csv','application/json','application/pdf'])
on conflict (id) do nothing;

-- Lecture publique des visuels de la boutique
create policy "visuels produits en lecture publique"
  on storage.objects for select
  using (bucket_id in ('product-images','category-images','brand-assets'));

-- Seule l'équipe dépose / remplace / supprime des visuels
create policy "visuels déposés par l'équipe"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images','category-images','brand-assets')
              and public.is_staff());

create policy "visuels modifiés par l'équipe"
  on storage.objects for update to authenticated
  using (bucket_id in ('product-images','category-images','brand-assets') and public.is_staff());

create policy "visuels supprimés par l'équipe"
  on storage.objects for delete to authenticated
  using (bucket_id in ('product-images','category-images','brand-assets') and public.is_staff());

-- Exports (CSV d'analyses, rapports) : équipe uniquement, bucket privé
create policy "exports réservés à l'équipe"
  on storage.objects for all to authenticated
  using (bucket_id = 'exports' and public.is_staff())
  with check (bucket_id = 'exports' and public.is_staff());
