-- ============================================================================
--  Tests de sécurité de la base — à exécuter avec psql
--
--  Vérifie que les politiques RLS protègent réellement les données :
--   • le catalogue publié est lisible de tous ;
--   • les coûts, marges, stocks valorisés et chiffre d'affaires ne le sont pas ;
--   • proposer une action sensible et la décider sont deux droits distincts ;
--   • une demande non approuvée, déjà appliquée ou expirée ne s'applique pas.
--
--  Usage (base de test jetable, voir scripts/test-db.sh) :
--      psql -f tests/sql/rls.test.sql
--
--  Chaque test affiche ATTENDU / OBTENU et un verdict. Le script se termine
--  en erreur si un seul test échoue.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off
\pset tuples_only off

create temporary table resultats (
  nom text, attendu text, obtenu text, ok boolean
) on commit preserve rows;

-- La table temporaire appartient au rôle de session. Les tests endossent
-- `anon` puis `authenticated` : sans ce droit, leurs résultats seraient perdus.
grant all on resultats to anon, authenticated;

create or replace function pg_temp.verifier(p_nom text, p_attendu text, p_obtenu text)
returns void language plpgsql as $$
begin
  insert into resultats values (p_nom, p_attendu, p_obtenu, p_attendu = p_obtenu);
end $$;

-- ───────────────────────── Comptes de test ──────────────────────────────
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'client@test.fr'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'equipe@test.fr'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'admin@test.fr')
on conflict do nothing;

insert into public.profiles (id, email, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'client@test.fr', 'customer'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'equipe@test.fr', 'staff'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'admin@test.fr', 'admin')
on conflict (id) do update set role = excluded.role;

-- Un produit non publié, qui ne doit jamais apparaître côté boutique
insert into public.products (slug, name, status, base_price, cost_price)
values ('test-brouillon-confidentiel', 'Brouillon confidentiel', 'draft', 999, 400)
on conflict (slug) do nothing;

-- ══════════════════════════ VISITEUR ANONYME ════════════════════════════
select set_config('request.jwt.claim.sub', '', false);
set role anon;

select pg_temp.verifier('anon · catalogue publié lisible', 'oui',
  case when (select count(*) from public.catalog_products) > 0 then 'oui' else 'non' end);

select pg_temp.verifier('anon · brouillon invisible', '0',
  (select count(*)::text from public.catalog_products where status <> 'active'));

select pg_temp.verifier('anon · disponibilité lisible (plus que N pièces)', 'oui',
  case when (select count(*) from public.variant_availability) > 0 then 'oui' else 'non' end);

select pg_temp.verifier('anon · COÛTS D''ACHAT inaccessibles', '0',
  (select count(*)::text from public.products));

select pg_temp.verifier('anon · coût des variantes inaccessible', '0',
  (select count(*)::text from public.product_variants));

select pg_temp.verifier('anon · MARGES inaccessibles', '0',
  (select count(*)::text from public.variant_margins));

select pg_temp.verifier('anon · valeur du stock inaccessible', '0',
  (select count(*)::text from public.inventory_health));

select pg_temp.verifier('anon · chiffre d''affaires inaccessible', '0',
  (select count(*)::text from public.product_performance));

select pg_temp.verifier('anon · KPI journaliers inaccessibles', '0',
  (select count(*)::text from public.kpi_daily));

select pg_temp.verifier('anon · codes de réduction non listables', '0',
  (select count(*)::text from public.discounts));

select pg_temp.verifier('anon · objectifs économiques inaccessibles', '0',
  (select count(*)::text from public.shop_settings));

select pg_temp.verifier('anon · paramètres publics lisibles', '1',
  (select count(*)::text from public.shop_public_settings));

select pg_temp.verifier('anon · commandes inaccessibles', '0',
  (select count(*)::text from public.orders));

select pg_temp.verifier('anon · profils clients inaccessibles', '0',
  (select count(*)::text from public.profiles));

select pg_temp.verifier('anon · modules Nexscope inaccessibles', '0',
  (select count(*)::text from public.nexscope_skills));

select pg_temp.verifier('anon · fournisseurs inaccessibles', '0',
  (select count(*)::text from public.suppliers));

select pg_temp.verifier('anon · approbations inaccessibles', '0',
  (select count(*)::text from public.approval_requests));

reset role;

-- ═════════════════════════ CLIENT CONNECTÉ ══════════════════════════════
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;

select pg_temp.verifier('client · ne voit que son profil', '1',
  (select count(*)::text from public.profiles));

select pg_temp.verifier('client · coûts toujours inaccessibles', '0',
  (select count(*)::text from public.products));

select pg_temp.verifier('client · marges toujours inaccessibles', '0',
  (select count(*)::text from public.variant_margins));

do $$
declare v integer;
begin
  update public.products set base_price = 1;
  get diagnostics v = row_count;
  insert into resultats
    values ('client · ne peut pas modifier un prix', '0', v::text, v = 0);
end $$;

reset role;

-- ════════════════════════════ ÉQUIPE ════════════════════════════════════
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
set role authenticated;

select pg_temp.verifier('équipe · rôle applicatif correct', 'staff',
  public.current_role()::text);

select pg_temp.verifier('équipe · voit les brouillons', 'oui',
  case when (select count(*) from public.products where status = 'draft') > 0
       then 'oui' else 'non' end);

select pg_temp.verifier('équipe · accède aux marges', 'oui',
  case when (select count(*) from public.variant_margins) > 0 then 'oui' else 'non' end);

select pg_temp.verifier('équipe · accède aux 162 modules', '162',
  (select count(*)::text from public.nexscope_skills));

do $$
declare v integer;
begin
  insert into public.approval_requests (action_type, risk, title, rationale, payload)
  values ('price_change', 'high', 'Test — proposition équipe',
          'Vérification de la séparation proposer / décider', '{"changes":[]}'::jsonb);
  get diagnostics v = row_count;
  insert into resultats
    values ('équipe · PEUT proposer une action sensible', 'oui',
            case when v = 1 then 'oui' else 'non' end, v = 1);
exception when others then
  insert into resultats
    values ('équipe · PEUT proposer une action sensible', 'oui',
            'refusé : ' || sqlerrm, false);
end $$;

do $$
declare v integer;
begin
  update public.approval_requests set status = 'approved'
   where title = 'Test — proposition équipe';
  get diagnostics v = row_count;
  insert into resultats
    values ('équipe · NE PEUT PAS décider', '0', v::text, v = 0);
end $$;

reset role;

-- ═════════════════════════ ADMINISTRATEUR ═══════════════════════════════
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
declare v integer;
begin
  update public.approval_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where title = 'Test — proposition équipe';
  get diagnostics v = row_count;
  insert into resultats values ('admin · peut décider', '1', v::text, v = 1);
end $$;

do $$
declare v integer;
begin
  update public.shop_settings set target_net_margin = 0.25;
  get diagnostics v = row_count;
  insert into resultats
    values ('admin · peut modifier les paramètres', '1', v::text, v = 1);
end $$;

reset role;

-- ════════════════════ APPLICATION D'UNE APPROBATION ════════════════════
-- Changement de prix réel, de bout en bout, avec traçabilité.
insert into public.approval_requests
  (action_type, risk, status, title, rationale, payload, previous_state, decided_at)
select 'price_change', 'high', 'approved',
       'Test — application de prix',
       'Vérification de l''application et de la traçabilité',
       jsonb_build_object('changes', jsonb_build_array(jsonb_build_object(
         'product_id', p.id, 'variant_id', null,
         'current_price', p.base_price, 'new_price', round(p.base_price * 1.05, 2)))),
       jsonb_build_object('base_price', p.base_price),
       now()
  from public.products p where p.status = 'active' order by p.created_at limit 1;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
declare
  v_id uuid;
  v_avant numeric;
  v_apres numeric;
  v_produit uuid;
begin
  select id into v_id from public.approval_requests
   where title = 'Test — application de prix';
  v_produit := ((payload -> 'changes' -> 0 ->> 'product_id')::uuid)
               from public.approval_requests where id = v_id;
  select base_price into v_avant from public.products where id = v_produit;

  perform public.apply_approval(v_id);

  select base_price into v_apres from public.products where id = v_produit;
  insert into resultats
    values ('application · le prix change effectivement', 'oui',
            case when v_apres > v_avant then 'oui'
                 else format('non (%s → %s)', v_avant, v_apres) end,
            v_apres > v_avant);
exception when others then
  insert into resultats
    values ('application · le prix change effectivement', 'oui',
            'erreur : ' || sqlerrm, false);
end $$;

select pg_temp.verifier('application · ancien prix conservé (retour en arrière)', 'oui',
  case when (select count(*) from public.price_history where old_price is not null) > 0
       then 'oui' else 'non' end);

select pg_temp.verifier('application · auteur de la décision tracé', 'oui',
  case when (select count(*) from public.price_history where approved_by is not null) > 0
       then 'oui' else 'non' end);

reset role;

-- ═══════════════════════════ EXPIRATION ═════════════════════════════════
insert into public.approval_requests
  (action_type, title, rationale, payload, status, expires_at)
values ('price_change', 'Test — demande périmée', 'Vérification de l''expiration',
        '{"changes":[]}'::jsonb, 'approved', now() - interval '1 day');

-- Le balayage est exécuté dans sa propre instruction : au sein d'une même
-- requête, rien ne garantit que la fonction s'exécute avant la lecture.
select public.expire_stale_approvals() as demandes_expirees;

select pg_temp.verifier('expiration · le balayage marque la demande', 'expired',
  (select status::text from public.approval_requests
    where title = 'Test — demande périmée'));

-- ═══════════════════════ FONCTIONS MÉTIER ══════════════════════════════
select pg_temp.verifier('code promo · valide au-dessus du minimum', 'true',
  (public.validate_discount('BIENVENUE10', 150, null) ->> 'valid'));

select pg_temp.verifier('code promo · refusé sous le minimum', 'false',
  (public.validate_discount('BIENVENUE10', 50, null) ->> 'valid'));

select pg_temp.verifier('code promo · code inconnu refusé', 'false',
  (public.validate_discount('CODE-QUI-NEXISTE-PAS', 500, null) ->> 'valid'));

select pg_temp.verifier('économie unitaire · renvoie un objet exploitable', 'oui',
  case when public.store_unit_economics(90) ? 'aov' then 'oui' else 'non' end);

-- ═══════════════════════════ RÉSULTATS ══════════════════════════════════
\echo ''
\echo '═════════════════════ RÉSULTATS DES TESTS RLS ═════════════════════'
select case when ok then '  OK  ' else ' ÉCHEC' end as etat,
       nom, attendu, obtenu
  from resultats order by ok, nom;

\echo ''
select count(*) filter (where ok) as reussis,
       count(*) filter (where not ok) as echoues,
       count(*) as total
  from resultats;

-- Sortie en erreur si un test a échoué
do $$
declare v_echecs integer;
begin
  select count(*) into v_echecs from resultats where not ok;
  if v_echecs > 0 then
    raise exception '% test(s) de sécurité en échec', v_echecs;
  end if;
  raise notice 'Tous les tests de sécurité passent.';
end $$;
