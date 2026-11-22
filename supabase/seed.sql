-- ============================================================================
--  JEU DE DÉMONSTRATION — à remplacer par votre catalogue réel
--
--  ⚠️  IMPORTANT : ce fichier n'est PAS une migration. Il n'est appliqué que
--  sur demande explicite (`supabase db reset` en local, ou exécution manuelle
--  dans l'éditeur SQL). Les produits, prix, coûts et fournisseurs ci-dessous
--  sont des EXEMPLES destinés à faire fonctionner l'interface et les calculs
--  de marge dès l'installation. Aucun n'est un produit ou un partenaire réel.
--
--  Pour partir d'une boutique vide : ne pas exécuter ce fichier.
-- ============================================================================

-- ─────────────────────────── Catégories ─────────────────────────────
insert into public.categories (id, slug, name, description, position, is_visible) values
  ('11111111-0000-4000-8000-000000000001','costumes-vestes','Costumes & Vestes',
   'Pièces structurées, épaules nettes, étoffes qui tiennent dans le temps.',1,true),
  ('11111111-0000-4000-8000-000000000002','chemises','Chemises',
   'Cols travaillés, popelines et oxford, coupes près du corps ou amples.',2,true),
  ('11111111-0000-4000-8000-000000000003','pantalons','Pantalons',
   'Du pantalon à pinces au denim brut, pour construire une silhouette.',3,true),
  ('11111111-0000-4000-8000-000000000004','maille','Maille',
   'Laines mérinos et cotons peignés, tricotés serré.',4,true),
  ('11111111-0000-4000-8000-000000000005','accessoires','Accessoires',
   'Le détail qui signe la tenue : chapeaux, cravates, pochettes, ceintures.',5,true),
  ('11111111-0000-4000-8000-000000000006','chaussures','Chaussures',
   'Cuirs pleine fleur, montage cousu, patines qui se méritent.',6,true)
on conflict (slug) do nothing;

-- ────────────────────────── Fournisseurs ────────────────────────────
insert into public.suppliers (id, name, contact_name, email, country_code,
  lead_time_days, production_days, shipping_days, payment_terms_days,
  min_order_quantity, min_order_value, reliability_score, notes, is_active) values
  ('22222222-0000-4000-8000-000000000001','Atelier Lusitano (exemple)','—',
   'contact@exemple-lusitano.test','PT',28,18,6,30,30,2500,88,
   'Fournisseur de démonstration — remplacer par votre atelier réel.',true),
  ('22222222-0000-4000-8000-000000000002','Maille des Vosges (exemple)','—',
   'contact@exemple-vosges.test','FR',21,14,3,45,20,1800,92,
   'Fournisseur de démonstration — remplacer par votre atelier réel.',true),
  ('22222222-0000-4000-8000-000000000003','Cuirs & Formes (exemple)','—',
   'contact@exemple-cuirs.test','IT',35,24,8,30,12,3000,80,
   'Fournisseur de démonstration — remplacer par votre atelier réel.',true)
on conflict (id) do nothing;

-- ─────────────────── Zones et méthodes de livraison ─────────────────
insert into public.shipping_zones (id, name, country_codes, is_active) values
  ('33333333-0000-4000-8000-000000000001','France métropolitaine', array['FR']::char(2)[], true),
  ('33333333-0000-4000-8000-000000000002','Union européenne',
   array['BE','LU','DE','ES','IT','NL','PT','AT','IE','FI','SE','DK','PL','CZ','GR']::char(2)[], true),
  ('33333333-0000-4000-8000-000000000003','International',
   array['CH','GB','US','CA','JP','AU','MA','SN','CI','CD','CG']::char(2)[], true)
on conflict (id) do nothing;

insert into public.shipping_methods (zone_id, name, carrier, price, free_above, delay_min_days, delay_max_days, position) values
  ('33333333-0000-4000-8000-000000000001','Colissimo domicile','La Poste',6.90,120,2,3,1),
  ('33333333-0000-4000-8000-000000000001','Point relais','Mondial Relay',4.50,120,3,5,2),
  ('33333333-0000-4000-8000-000000000001','Chronopost 24 h','Chronopost',14.90,null,1,1,3),
  ('33333333-0000-4000-8000-000000000002','Standard UE','Colissimo International',12.90,200,4,7,1),
  ('33333333-0000-4000-8000-000000000002','Express UE','DHL',24.90,null,2,3,2),
  ('33333333-0000-4000-8000-000000000003','International standard','DHL',29.90,350,6,12,1)
on conflict do nothing;

-- ══════════════════════════ PRODUITS ════════════════════════════════
--  Les coûts (cost_price, inbound_shipping, handling_fee, return_rate…)
--  sont renseignés pour que les modules de marge et de pricing Nexscope
--  calculent sur des données complètes dès la première ouverture.
insert into public.products (
  id, slug, name, subtitle, description, story, composition, care_guide,
  status, category_id, base_price, compare_at_price, cost_price,
  inbound_shipping, handling_fee, ad_spend_ratio, return_rate, return_fee,
  weight_grams, supplier_id, lead_time_days, tags, is_featured, published_at,
  seo_title, seo_description
) values
  ('44444444-0000-4000-8000-000000000001','costume-trois-pieces-bordeaux',
   'Costume trois pièces Bordeaux','Laine froide, revers crantés',
   'Un trois pièces taillé net : revers crantés, veste demi-doublée, gilet ajusté et pantalon à pinces. La laine froide tombe droit et respire — portable d''avril à octobre.',
   'Le trois pièces est la grammaire de la Sape. Celui-ci n''invente rien : il exécute, proprement, dans une laine qui garde le pli.',
   '98 % laine vierge, 2 % élasthanne. Doublure cupro.',
   'Nettoyage à sec uniquement. Brosser après chaque port, laisser reposer 24 h sur cintre large.',
   'active','11111111-0000-4000-8000-000000000001',
   689.00, 790.00, 212.00, 11.50, 4.20, 0.08, 0.09, 12.00, 1850,
   '22222222-0000-4000-8000-000000000001', 28,
   array['costume','laine','ceremonie','trois-pieces'], true, now() - interval '40 days',
   'Costume trois pièces Bordeaux en laine froide — La Sappe Authentique',
   'Trois pièces bordeaux, laine froide 98 %, revers crantés et gilet ajusté. Coupe taillée net, livraison offerte dès 120 €.'),

  ('44444444-0000-4000-8000-000000000002','veste-croisee-encre',
   'Veste croisée Encre','Six boutons, épaule napolitaine',
   'Croisée six boutons, épaule napolitaine souple, deux fentes latérales. Une veste qui se porte autant sur un pantalon de flanelle que sur un denim brut.',
   'La croisée intimide à tort. Souple d''épaule et courte de basque, elle devient la pièce la plus portable du vestiaire.',
   '100 % laine vierge Super 110s.','Nettoyage à sec. Ne pas repasser directement sur le revers.',
   'active','11111111-0000-4000-8000-000000000001',
   449.00, null, 148.00, 9.80, 3.80, 0.10, 0.11, 12.00, 1120,
   '22222222-0000-4000-8000-000000000001', 28,
   array['veste','croisee','laine'], true, now() - interval '32 days',
   'Veste croisée Encre, épaule napolitaine — La Sappe Authentique',
   'Veste croisée six boutons en laine Super 110s, épaule napolitaine souple. Fabrication européenne.'),

  ('44444444-0000-4000-8000-000000000003','chemise-popeline-ivoire',
   'Chemise popeline Ivoire','Col italien, poignets mousquetaire',
   'Popeline de coton peigné 120 fils, col italien tenu par baleines amovibles, poignets mousquetaire. Le blanc cassé qui réchauffe le teint.',
   'Une chemise blanche n''est jamais neutre : c''est la surface sur laquelle tout le reste se lit.',
   '100 % coton peigné 120 fils.','Lavage 30 °C, repassage humide. Ne pas sécher en machine.',
   'active','11111111-0000-4000-8000-000000000002',
   129.00, 149.00, 31.50, 3.20, 2.10, 0.12, 0.14, 8.00, 280,
   '22222222-0000-4000-8000-000000000001', 21,
   array['chemise','popeline','coton','blanc'], true, now() - interval '55 days',
   'Chemise popeline ivoire, col italien — La Sappe Authentique',
   'Popeline de coton peigné 120 fils, col italien, poignets mousquetaire. Coupe ajustée, du S au XXL.'),

  ('44444444-0000-4000-8000-000000000004','chemise-oxford-indigo',
   'Chemise Oxford Indigo','Col boutonné, coupe droite',
   'Oxford épais à col boutonné, coupe droite, pan arrondi. Elle se patine et se ramollit à chaque lavage.',
   'L''oxford est la chemise qui vieillit bien — la seule qu''on garde dix ans sans y penser.',
   '100 % coton Oxford 140 g/m².','Lavage 30 °C. Séchage à l''air libre.',
   'active','11111111-0000-4000-8000-000000000002',
   98.00, null, 24.00, 2.80, 2.10, 0.12, 0.12, 8.00, 320,
   '22222222-0000-4000-8000-000000000001', 21,
   array['chemise','oxford','coton','indigo'], false, now() - interval '48 days',
   'Chemise Oxford Indigo col boutonné — La Sappe Authentique',
   'Oxford 140 g/m² à col boutonné, coupe droite. Un basique qui se patine.'),

  ('44444444-0000-4000-8000-000000000005','pantalon-pinces-flanelle',
   'Pantalon à pinces Flanelle','Taille haute, revers 4 cm',
   'Flanelle de laine brossée, double pince, taille haute tenue par une ceinture intérieure, revers de 4 cm. Il tombe sans casser.',
   'La taille haute n''est pas un effet de mode : elle allonge la jambe et laisse la chemise en place.',
   '100 % laine flanelle 320 g/m².','Nettoyage à sec. Repasser avec pattemouille.',
   'active','11111111-0000-4000-8000-000000000003',
   189.00, 215.00, 52.00, 4.60, 2.40, 0.10, 0.16, 10.00, 620,
   '22222222-0000-4000-8000-000000000001', 21,
   array['pantalon','flanelle','laine','pinces'], true, now() - interval '28 days',
   'Pantalon à pinces en flanelle de laine — La Sappe Authentique',
   'Flanelle 320 g/m², double pince, taille haute, revers 4 cm. Tombé impeccable.'),

  ('44444444-0000-4000-8000-000000000006','denim-brut-selvedge',
   'Denim brut Selvedge','14,5 oz, lisière japonaise',
   'Denim brut 14,5 oz tissé sur métiers à navette, lisière rouge, coupe droite légèrement fuselée. Rigide au départ, moulé à votre démarche ensuite.',
   'Le brut se gagne. Six mois sans lavage et le jean raconte vos trajets.',
   '100 % coton denim selvedge 14,5 oz.','Premier lavage à froid, à l''envers, après 3 à 6 mois de port.',
   'active','11111111-0000-4000-8000-000000000003',
   165.00, null, 44.00, 5.10, 2.40, 0.09, 0.13, 10.00, 780,
   '22222222-0000-4000-8000-000000000002', 24,
   array['denim','selvedge','brut','jean'], false, now() - interval '20 days',
   'Denim brut selvedge 14,5 oz — La Sappe Authentique',
   'Denim japonais 14,5 oz à lisière, coupe droite fuselée. Brut, à patiner.'),

  ('44444444-0000-4000-8000-000000000007','pull-merinos-cotes-anglaises',
   'Pull mérinos côtes anglaises','Col rond, laine extra-fine 19,5 µ',
   'Mérinos extra-fin tricoté en côtes anglaises, col rond bordé, emmanchures montées. Chaud sans épaisseur.',
   'Le mérinos fin est la seule maille qui passe sous une veste sans la déformer.',
   '100 % laine mérinos extra-fine 19,5 microns.','Lavage à la main 20 °C ou cycle laine. Sécher à plat.',
   'active','11111111-0000-4000-8000-000000000004',
   179.00, 199.00, 48.00, 3.90, 2.20, 0.11, 0.10, 9.00, 420,
   '22222222-0000-4000-8000-000000000002', 21,
   array['pull','merinos','maille','laine'], true, now() - interval '18 days',
   'Pull mérinos extra-fin, côtes anglaises — La Sappe Authentique',
   'Mérinos 19,5 µ en côtes anglaises, col rond. Chaud, fin, portable sous veste.'),

  ('44444444-0000-4000-8000-000000000008','cardigan-shawl-camel',
   'Cardigan châle Camel','Maille lourde, boutons corne',
   'Cardigan à col châle en maille lourde, boutons en corne véritable, poches plaquées. La pièce du dimanche qui finit par sortir tous les jours.',
   'Un cardigan bien coupé remplace une veste sans jamais prétendre en être une.',
   '70 % laine, 30 % alpaga.','Lavage à la main. Sécher à plat, loin d''une source de chaleur.',
   'active','11111111-0000-4000-8000-000000000004',
   239.00, null, 71.00, 4.80, 2.60, 0.10, 0.12, 9.00, 760,
   '22222222-0000-4000-8000-000000000002', 21,
   array['cardigan','alpaga','maille'], false, now() - interval '14 days',
   'Cardigan col châle laine et alpaga — La Sappe Authentique',
   'Maille lourde laine-alpaga, col châle, boutons corne. Confort de chambre, allure de ville.'),

  ('44444444-0000-4000-8000-000000000009','borsalino-feutre-noir',
   'Feutre Borsalino Noir','Poil de lapin, ruban gros-grain',
   'Feutre en poil de lapin, bord de 6 cm, calotte pincée, ruban gros-grain cousu main. Forme tenue, pliage toléré.',
   'Le chapeau est la signature. Sans lui, la tenue s''arrête au col.',
   '100 % poil de lapin. Ruban viscose gros-grain.','Brosser dans le sens du poil. Ranger sur la calotte, jamais sur le bord.',
   'active','11111111-0000-4000-8000-000000000005',
   189.00, 220.00, 58.00, 4.20, 2.80, 0.08, 0.07, 9.00, 180,
   '22222222-0000-4000-8000-000000000003', 30,
   array['chapeau','feutre','accessoire'], true, now() - interval '36 days',
   'Feutre en poil de lapin, ruban gros-grain — La Sappe Authentique',
   'Feutre poil de lapin, bord 6 cm, calotte pincée. Fait main, du 55 au 61.'),

  ('44444444-0000-4000-8000-000000000010','cravate-soie-grenadine',
   'Cravate soie grenadine','Tissage garza fina, 8 cm',
   'Soie grenadine tissée garza fina, doublure laine, pointe de 8 cm, montée à la main en trois plis. Le nœud se fait tout seul.',
   'Une grenadine fait un nœud vivant, légèrement irrégulier — exactement ce qu''il faut.',
   '100 % soie. Doublure 100 % laine.','Ne pas repasser. Dénouer après chaque port, ranger roulée.',
   'active','11111111-0000-4000-8000-000000000005',
   89.00, null, 22.50, 1.80, 1.60, 0.12, 0.06, 6.00, 70,
   '22222222-0000-4000-8000-000000000003', 24,
   array['cravate','soie','accessoire','grenadine'], false, now() - interval '25 days',
   'Cravate en soie grenadine garza fina — La Sappe Authentique',
   'Soie grenadine garza fina, 8 cm, montage trois plis à la main.'),

  ('44444444-0000-4000-8000-000000000011','derby-cuir-patine',
   'Derby cuir patiné','Cousu Blake, cuir pleine fleur',
   'Derby trois œillets en veau pleine fleur patiné à la main, montage cousu Blake, semelle cuir. Chaussant droit, ressemelable.',
   'Un derby ressemelable est un achat, pas une dépense.',
   'Veau pleine fleur. Semelle cuir, talon gomme.','Embauchoirs après chaque port. Crème nourrissante tous les dix ports.',
   'active','11111111-0000-4000-8000-000000000006',
   329.00, 379.00, 104.00, 8.40, 3.60, 0.09, 0.18, 14.00, 1240,
   '22222222-0000-4000-8000-000000000003', 35,
   array['chaussures','derby','cuir'], true, now() - interval '12 days',
   'Derby en veau pleine fleur, cousu Blake — La Sappe Authentique',
   'Derby trois œillets, veau pleine fleur patiné main, cousu Blake ressemelable.'),

  ('44444444-0000-4000-8000-000000000012','pochette-lin-blanche',
   'Pochette de lin Blanche','Ourlet roulotté main',
   'Lin lavé, ourlet roulotté à la main, 40 × 40 cm. Se plie en pointe ou en bouffant, tient sans se tasser.',
   'La pochette ne doit jamais assortir la cravate. Elle dialogue, elle ne répète pas.',
   '100 % lin lavé.','Lavage 40 °C, repassage à plat.',
   'active','11111111-0000-4000-8000-000000000005',
   39.00, null, 8.50, 0.90, 1.20, 0.10, 0.04, 5.00, 30,
   '22222222-0000-4000-8000-000000000003', 24,
   array['pochette','lin','accessoire'], false, now() - interval '30 days',
   'Pochette de costume en lin, ourlet roulotté main — La Sappe Authentique',
   'Lin lavé 40 × 40 cm, ourlet roulotté main. Pliage pointe ou bouffant.')
on conflict (slug) do nothing;

-- ══════════════ Options, variantes, stock et images ═════════════════
--  Génération programmatique : tailles × couleurs par famille de produit.
do $$
declare
  r record;
  v_size_option uuid;
  v_color_option uuid;
  v_size text;
  v_color record;
  v_variant uuid;
  v_sizes text[];
  v_colors jsonb;
  v_sku_base text;
  v_idx integer;
  v_cidx integer;
  v_stock integer;
begin
  for r in select id, slug, name, category_id, base_price, cost_price from public.products loop

    -- Grille de tailles selon la famille
    v_sizes := case
      when r.slug like '%borsalino%'              then array['55','57','59','61']
      when r.slug like '%derby%'                  then array['40','41','42','43','44','45']
      when r.slug like '%cravate%' or r.slug like '%pochette%' then array['Taille unique']
      when r.slug like '%pantalon%' or r.slug like '%denim%'    then array['38','40','42','44','46','48']
      else array['S','M','L','XL','XXL']
    end;

    -- Coloris selon la pièce
    v_colors := case
      when r.slug = 'costume-trois-pieces-bordeaux' then
        '[{"v":"Bordeaux","h":"#6E1F30"},{"v":"Encre","h":"#1A1A20"},{"v":"Gris anthracite","h":"#3C3C44"}]'::jsonb
      when r.slug = 'veste-croisee-encre' then
        '[{"v":"Encre","h":"#1A1A20"},{"v":"Bleu nuit","h":"#1F2A44"}]'::jsonb
      when r.slug = 'chemise-popeline-ivoire' then
        '[{"v":"Ivoire","h":"#F2EDE3"},{"v":"Bleu ciel","h":"#C6D6E5"},{"v":"Rose poudré","h":"#E8CFCB"}]'::jsonb
      when r.slug = 'chemise-oxford-indigo' then
        '[{"v":"Indigo","h":"#33516E"},{"v":"Blanc","h":"#F8F5EF"}]'::jsonb
      when r.slug = 'pantalon-pinces-flanelle' then
        '[{"v":"Gris moyen","h":"#6E6E7E"},{"v":"Encre","h":"#1A1A20"},{"v":"Camel","h":"#A97F49"}]'::jsonb
      when r.slug = 'denim-brut-selvedge' then
        '[{"v":"Indigo brut","h":"#2E3B55"}]'::jsonb
      when r.slug = 'pull-merinos-cotes-anglaises' then
        '[{"v":"Camel","h":"#B8864F"},{"v":"Encre","h":"#1A1A20"},{"v":"Vert sauge","h":"#3F6B52"},{"v":"Bordeaux","h":"#6E1F30"}]'::jsonb
      when r.slug = 'cardigan-shawl-camel' then
        '[{"v":"Camel","h":"#B8864F"},{"v":"Gris perle","h":"#9A9AA8"}]'::jsonb
      when r.slug = 'borsalino-feutre-noir' then
        '[{"v":"Noir","h":"#0C0C0E"},{"v":"Gris tourterelle","h":"#8A8A94"}]'::jsonb
      when r.slug = 'cravate-soie-grenadine' then
        '[{"v":"Bordeaux","h":"#6E1F30"},{"v":"Bleu nuit","h":"#1F2A44"},{"v":"Vert forêt","h":"#2F4F3E"},{"v":"Or vieilli","h":"#C19A3E"}]'::jsonb
      when r.slug = 'derby-cuir-patine' then
        '[{"v":"Noir","h":"#0C0C0E"},{"v":"Cognac","h":"#8B5A2B"}]'::jsonb
      else '[{"v":"Blanc","h":"#F8F5EF"}]'::jsonb
    end;

    -- Création des options
    insert into public.product_options (product_id, name, position)
    values (r.id, 'Taille', 1)
    on conflict (product_id, name) do update set position = 1
    returning id into v_size_option;

    insert into public.product_options (product_id, name, position)
    values (r.id, 'Couleur', 2)
    on conflict (product_id, name) do update set position = 2
    returning id into v_color_option;

    -- Valeurs de taille
    v_idx := 0;
    foreach v_size in array v_sizes loop
      v_idx := v_idx + 1;
      insert into public.product_option_values (option_id, value, position)
      values (v_size_option, v_size, v_idx)
      on conflict (option_id, value) do nothing;
    end loop;

    -- Valeurs de couleur
    v_cidx := 0;
    for v_color in select (c ->> 'v') as value, (c ->> 'h') as hex
                     from jsonb_array_elements(v_colors) c loop
      v_cidx := v_cidx + 1;
      insert into public.product_option_values (option_id, value, swatch_hex, position)
      values (v_color_option, v_color.value, v_color.hex, v_cidx)
      on conflict (option_id, value) do update set swatch_hex = excluded.swatch_hex;
    end loop;

    -- Variantes = produit cartésien taille × couleur
    v_sku_base := upper(left(regexp_replace(r.slug, '[^a-z]', '', 'g'), 6));
    v_idx := 0;
    foreach v_size in array v_sizes loop
      for v_color in select (c ->> 'v') as value from jsonb_array_elements(v_colors) c loop
        v_idx := v_idx + 1;
        insert into public.product_variants
          (product_id, sku, title, cost_price, position, is_active)
        values (
          r.id,
          format('%s-%s-%s', v_sku_base,
                 upper(regexp_replace(v_size, '[^A-Za-z0-9]', '', 'g')),
                 upper(left(regexp_replace(public.unaccent(v_color.value), '[^A-Za-z]', '', 'g'), 3))),
          format('%s / %s', v_size, v_color.value),
          r.cost_price,
          v_idx,
          true
        )
        on conflict (sku) do nothing
        returning id into v_variant;

        if v_variant is not null then
          -- Liaison aux valeurs d'options
          insert into public.variant_option_values (variant_id, option_value_id)
          select v_variant, ov.id
            from public.product_option_values ov
           where (ov.option_id = v_size_option  and ov.value = v_size)
              or (ov.option_id = v_color_option and ov.value = v_color.value)
          on conflict do nothing;

          -- Stock : les tailles du milieu sont mieux dotées (réalité terrain)
          v_stock := case
            when v_size in ('M','L','42','41','57','40','44') then 9 + (v_idx % 7)
            when v_size = 'Taille unique'                      then 24 + (v_idx % 11)
            else 2 + (v_idx % 5)
          end;

          insert into public.inventory_levels (variant_id, on_hand, reorder_point, reorder_quantity)
          values (v_variant, v_stock, 4, 24)
          on conflict (variant_id) do nothing;

          insert into public.stock_movements (variant_id, delta, reason, reference, note)
          values (v_variant, v_stock, 'initial', 'SEED', 'Stock initial du jeu de démonstration');
        end if;
        v_variant := null;
      end loop;
    end loop;
  end loop;
end $$;

-- ────────────────── Codes de réduction d'exemple ────────────────────
insert into public.discounts (code, title, type, value, min_subtotal, max_discount,
                              usage_limit, usage_limit_per_customer, starts_at, ends_at, is_active) values
  ('BIENVENUE10','Bienvenue — 10 % sur la première commande','percentage',10,80,60,1000,1,now(),now()+interval '180 days',true),
  ('SAPE25','Opération Sape — 25 € dès 200 € d''achat','fixed_amount',25,200,null,300,2,now(),now()+interval '45 days',true),
  ('FRANCO','Livraison offerte sans minimum','free_shipping',0,0,null,null,3,now(),now()+interval '90 days',true)
on conflict (code) do nothing;

insert into public.promotions (title, description, type, value, category_id, starts_at, ends_at, banner_text, is_active) values
  ('Maille d''hiver','Remise automatique sur toute la maille','percentage',15,
   '11111111-0000-4000-8000-000000000004', now(), now()+interval '30 days',
   '−15 % sur la maille jusqu''à la fin du mois', true)
on conflict do nothing;

-- ───────────────── Concurrents suivis (exemples) ────────────────────
insert into public.competitors (id, name, website, platform, country_code, positioning, is_tracked, notes) values
  ('55555555-0000-4000-8000-000000000001','Concurrent A (exemple)','https://exemple-a.test','shopify','FR','premium',true,
   'Exemple de veille — remplacer par un concurrent réel puis saisir ou importer ses prix.'),
  ('55555555-0000-4000-8000-000000000002','Concurrent B (exemple)','https://exemple-b.test','shopify','IT','milieu de gamme',true,
   'Exemple de veille — remplacer par un concurrent réel puis saisir ou importer ses prix.')
on conflict (id) do nothing;

-- ───────────── Automatisations prêtes à l'emploi (en pause) ─────────
--  Elles sont créées EN PAUSE : à activer sciemment depuis le back-office.
insert into public.automations (name, description, kind, skill_slug, status,
  schedule_cron, config, requires_approval, max_price_change_pct) values
  ('Alerte stock bas — quotidienne',
   'Vérifie chaque matin les variantes sous leur seuil de réapprovisionnement et crée une alerte.',
   'stock_alert', null, 'paused', '0 6 * * *',
   '{"severity_threshold":"warning"}'::jsonb, false, 0),
  ('Marge sous l''objectif — hebdomadaire',
   'Recalcule la marge nette réelle de chaque variante et signale celles sous l''objectif de la boutique.',
   'skill_analysis', 'profit-margin-calculator-shopify', 'paused', '0 7 * * 1',
   '{"scope":"all_active"}'::jsonb, true, 0.10),
  ('Rapport de ventes — hebdomadaire',
   'Produit un rapport de ventes, marge et top produits sur les 7 derniers jours.',
   'sales_report', 'sales-tracking-tool', 'paused', '30 7 * * 1',
   '{"window_days":7}'::jsonb, false, 0),
  ('Veille prix concurrents — hebdomadaire',
   'Compare les derniers relevés de prix concurrents à vos prix et signale les écarts significatifs.',
   'price_alert', 'competitor-price-tracker', 'paused', '0 8 * * 2',
   '{"deviation_threshold":0.08}'::jsonb, true, 0.10),
  ('Recommandation de prix — mensuelle',
   'Propose des ajustements de prix bornés, soumis à votre approbation explicite.',
   'price_recommendation', 'dynamic-pricing-ecommerce', 'paused', '0 8 1 * *',
   '{"target_margin":0.25,"max_change_pct":0.08}'::jsonb, true, 0.08)
on conflict do nothing;
