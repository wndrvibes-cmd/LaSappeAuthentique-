-- ============================================================================
-- 0008 — Row Level Security
--
--  Règles générales :
--   • catalogue publié  → lecture publique, écriture équipe
--   • données client    → le client ne voit que les siennes
--   • back-office       → équipe (staff) ; réglages et approbations → admin
--   • intelligence      → équipe uniquement (jamais exposée au public)
-- ============================================================================

-- Activation RLS sur toutes les tables du schéma public
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public'
       and tablename not like 'pg_%'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- Le propriétaire des vues applique les droits des tables sous-jacentes
alter view public.variant_availability set (security_invoker = on);
alter view public.variant_pricing      set (security_invoker = on);
alter view public.variant_margins      set (security_invoker = on);
alter view public.kpi_daily            set (security_invoker = on);
alter view public.product_performance  set (security_invoker = on);
alter view public.inventory_health     set (security_invoker = on);
-- `shop_public_settings` est volontairement laissée en security_definer :
-- c'est ce qui autorise la lecture publique de ses seules colonnes.

-- ══════════════════════════ CATALOGUE ═══════════════════════════════
create policy "categories visibles publiquement"
  on public.categories for select
  using (is_visible or public.is_staff());
create policy "categories gérées par l'équipe"
  on public.categories for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "produits actifs visibles publiquement"
  on public.products for select
  using (status = 'active' or public.is_staff());
create policy "produits gérés par l'équipe"
  on public.products for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Options, valeurs, variantes, images : visibles si le produit l'est
create policy "options visibles avec le produit"
  on public.product_options for select
  using (exists (select 1 from public.products p
                  where p.id = product_id and (p.status = 'active' or public.is_staff())));
create policy "options gérées par l'équipe"
  on public.product_options for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "valeurs d'options visibles"
  on public.product_option_values for select
  using (exists (select 1 from public.product_options o
                  join public.products p on p.id = o.product_id
                 where o.id = option_id and (p.status = 'active' or public.is_staff())));
create policy "valeurs d'options gérées par l'équipe"
  on public.product_option_values for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "variantes visibles avec le produit"
  on public.product_variants for select
  using (exists (select 1 from public.products p
                  where p.id = product_id and (p.status = 'active' or public.is_staff())));
create policy "variantes gérées par l'équipe"
  on public.product_variants for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "liaisons variantes visibles"
  on public.variant_option_values for select using (true);
create policy "liaisons variantes gérées par l'équipe"
  on public.variant_option_values for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "images visibles avec le produit"
  on public.product_images for select
  using (exists (select 1 from public.products p
                  where p.id = product_id and (p.status = 'active' or public.is_staff())));
create policy "images gérées par l'équipe"
  on public.product_images for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Stock : disponibilité lisible (affichage « en stock »), détails réservés
create policy "niveaux de stock lisibles"
  on public.inventory_levels for select using (true);
create policy "niveaux de stock gérés par l'équipe"
  on public.inventory_levels for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "mouvements de stock réservés à l'équipe"
  on public.stock_movements for select to authenticated using (public.is_staff());
create policy "mouvements de stock créés par l'équipe"
  on public.stock_movements for insert to authenticated with check (public.is_staff());

-- ══════════════════════════ CLIENTS ═════════════════════════════════
create policy "profil : lecture de son propre profil"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy "profil : modification de son propre profil"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());
-- Le rôle ne peut jamais être élevé par l'utilisateur lui-même
create policy "profil : rôle modifiable par un administrateur seulement"
  on public.profiles for insert to authenticated
  with check (public.is_admin());

create policy "adresses : propriétaire uniquement"
  on public.addresses for all to authenticated
  using (profile_id = auth.uid() or public.is_staff())
  with check (profile_id = auth.uid() or public.is_staff());

-- ══════════════════ PANIER (client connecté ou invité) ══════════════
create policy "panier : propriétaire ou invité porteur du jeton"
  on public.carts for select
  using (profile_id = auth.uid()
         or guest_token::text = current_setting('request.headers', true)::json ->> 'x-cart-token'
         or public.is_staff());
create policy "panier : création"
  on public.carts for insert
  with check (profile_id = auth.uid() or profile_id is null);
create policy "panier : mise à jour par le propriétaire"
  on public.carts for update
  using (profile_id = auth.uid()
         or guest_token::text = current_setting('request.headers', true)::json ->> 'x-cart-token')
  with check (profile_id = auth.uid()
         or guest_token::text = current_setting('request.headers', true)::json ->> 'x-cart-token');
create policy "panier : suppression par le propriétaire"
  on public.carts for delete
  using (profile_id = auth.uid()
         or guest_token::text = current_setting('request.headers', true)::json ->> 'x-cart-token');

create policy "lignes de panier : via le panier"
  on public.cart_items for all
  using (exists (select 1 from public.carts c where c.id = cart_id
                  and (c.profile_id = auth.uid()
                       or c.guest_token::text = current_setting('request.headers', true)::json ->> 'x-cart-token'
                       or public.is_staff())))
  with check (exists (select 1 from public.carts c where c.id = cart_id
                  and (c.profile_id = auth.uid()
                       or c.guest_token::text = current_setting('request.headers', true)::json ->> 'x-cart-token')));

create policy "favoris : propriétaire uniquement"
  on public.wishlist_items for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ══════════════════════════ LIVRAISON ══════════════════════════════
create policy "zones de livraison publiques"
  on public.shipping_zones for select using (is_active or public.is_staff());
create policy "zones gérées par l'équipe"
  on public.shipping_zones for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "méthodes de livraison publiques"
  on public.shipping_methods for select using (is_active or public.is_staff());
create policy "méthodes gérées par l'équipe"
  on public.shipping_methods for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ══════════════════════════ COMMANDES ══════════════════════════════
--  Création / paiement : uniquement par les Edge Functions (service role).
--  Le client peut lire ses commandes ; l'équipe peut tout gérer.
create policy "commandes : lecture par le client ou l'équipe"
  on public.orders for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
create policy "commandes : gestion par l'équipe"
  on public.orders for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "lignes de commande : via la commande"
  on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                  and (o.profile_id = auth.uid() or public.is_staff())));
create policy "lignes de commande : gestion par l'équipe"
  on public.order_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "événements de commande : via la commande"
  on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                  and (o.profile_id = auth.uid() or public.is_staff())));
create policy "événements de commande : ajout par l'équipe"
  on public.order_events for insert to authenticated with check (public.is_staff());

create policy "journal email réservé à l'équipe"
  on public.email_log for select to authenticated using (public.is_staff());

-- ══════════════════════════ PROMOTIONS ════════════════════════════
--  Les codes ne sont PAS listables publiquement : la validation passe
--  par la fonction validate_discount() (security definer).
create policy "codes de réduction réservés à l'équipe"
  on public.discounts for select to authenticated using (public.is_staff());
create policy "codes de réduction gérés par l'équipe"
  on public.discounts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "utilisations : équipe uniquement"
  on public.discount_redemptions for select to authenticated using (public.is_staff());

create policy "promotions actives publiques"
  on public.promotions for select using (
    (is_active and starts_at <= now() and (ends_at is null or ends_at > now()))
    or public.is_staff());
create policy "promotions gérées par l'équipe"
  on public.promotions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ════════════════════════ FOURNISSEURS ════════════════════════════
create policy "fournisseurs réservés à l'équipe"
  on public.suppliers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "bons de commande réservés à l'équipe"
  on public.purchase_orders for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "lignes de bons de commande réservées à l'équipe"
  on public.purchase_order_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ════════════════════════ PARAMÈTRES ══════════════════════════════
--  La table complète contient les objectifs économiques de la boutique :
--  sa lecture est réservée à l'équipe. La boutique publique passe par la vue
--  `shop_public_settings`, qui n'expose que l'identité et l'affichage.
create policy "paramètres boutique lisibles par l'équipe"
  on public.shop_settings for select to authenticated using (public.is_staff());
create policy "paramètres modifiables par un administrateur"
  on public.shop_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- La vue publique s'exécute avec les droits de son propriétaire (pas
-- `security_invoker`), ce qui permet la lecture anonyme des seules colonnes
-- publiables sans ouvrir la table sous-jacente.
grant select on public.shop_public_settings to anon, authenticated;

-- ═══════════════ INTELLIGENCE NEXSCOPE (équipe seule) ═════════════
create policy "registre des modules lisible par l'équipe"
  on public.nexscope_skills for select to authenticated using (public.is_staff());
create policy "registre des modules géré par un administrateur"
  on public.nexscope_skills for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "analyses réservées à l'équipe"
  on public.skill_runs for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "concurrents réservés à l'équipe"
  on public.competitors for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "produits concurrents réservés à l'équipe"
  on public.competitor_products for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "relevés de prix réservés à l'équipe"
  on public.price_observations for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "historique de prix réservé à l'équipe"
  on public.price_history for select to authenticated using (public.is_staff());
create policy "opportunités réservées à l'équipe"
  on public.product_opportunities for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "mentions de marque réservées à l'équipe"
  on public.brand_mentions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Avis : publiés visibles de tous ; dépôt par un client ayant commandé
create policy "avis publiés visibles"
  on public.product_reviews for select
  using (is_published or public.is_staff() or profile_id = auth.uid());
create policy "avis déposé par un client"
  on public.product_reviews for insert to authenticated
  with check (profile_id = auth.uid() and not is_published);
create policy "avis modérés par l'équipe"
  on public.product_reviews for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "avis supprimés par l'équipe"
  on public.product_reviews for delete to authenticated using (public.is_staff());

-- ═══════════════ AUTOMATISATIONS ET APPROBATIONS ══════════════════
create policy "automatisations lisibles par l'équipe"
  on public.automations for select to authenticated using (public.is_staff());
create policy "automatisations gérées par un administrateur"
  on public.automations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "historique d'automatisation lisible par l'équipe"
  on public.automation_runs for select to authenticated using (public.is_staff());

--  Une approbation ne peut JAMAIS être créée ni décidée par le client.
--  La décision (approve / reject) est réservée à l'administrateur.
create policy "approbations lisibles par l'équipe"
  on public.approval_requests for select to authenticated using (public.is_staff());
create policy "approbations décidées par un administrateur"
  on public.approval_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
--  L'équipe peut PROPOSER une action sensible (en exécutant un module) ;
--  seul un administrateur peut la décider et l'appliquer. La séparation
--  entre proposition et décision est le cœur du garde-fou.
create policy "approbations proposées par l'équipe"
  on public.approval_requests for insert to authenticated
  with check (public.is_staff() and status = 'pending' and decided_by is null);

create policy "alertes lisibles par l'équipe"
  on public.alerts for select to authenticated using (public.is_staff());
create policy "alertes traitées par l'équipe"
  on public.alerts for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
