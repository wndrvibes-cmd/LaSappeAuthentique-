# Architecture

## Principe directeur

Une seule base de données, une seule source de vérité. Les prix, les coûts, les
stocks, les commandes et les avis vivent dans Postgres. Les modules
d'intelligence commerciale lisent ces données plutôt que d'en demander la
saisie : c'est ce qui sépare un diagnostic d'un conseil générique.

Corollaire tenu partout : **quand une donnée manque, elle est signalée comme
manquante.** Aucun moteur ne remplace une donnée absente par une estimation
présentée comme un fait. Chaque résultat se termine par la liste de ce qui
limite l'analyse.

## Couches

```
┌─────────────────────────────────────────────────────────────────┐
│  Navigateur — React 18 + TypeScript + Tailwind                  │
│                                                                 │
│  Boutique                        Back-office (chargé à la       │
│  / · /boutique · /produit/:slug  demande)                       │
│  /panier · /commande · /compte   /admin/*                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Moteurs Nexscope — 13 algorithmes déterministes          │  │
│  │  src/lib/nexscope/engines/                                │  │
│  │  Exécutés dans le navigateur, sur les données lues en     │  │
│  │  base. Aucune clé API, résultat reproductible.            │  │
│  └───────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ supabase-js, sous RLS
┌───────────────────────────▼─────────────────────────────────────┐
│  Supabase                                                       │
│                                                                 │
│  Postgres          41 tables · 7 vues de calcul · RLS forcée    │
│  Auth              comptes clients, rôles customer/staff/admin  │
│  Storage           visuels produits, exports                    │
│  Edge Functions    checkout · skill-run · automation-tick ·     │
│                    stripe-webhook                               │
│  pg_cron           déclenchement des automatisations dues       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ appels sortants, côté serveur uniquement
          ┌─────────────────┼──────────────────┬──────────────────┐
          ▼                 ▼                  ▼                  ▼
      Stripe          api.anthropic.com    Resend        raw.githubusercontent
      paiement        analyses rédigées    emails        SKILL.md du dépôt
```

## Pourquoi les moteurs tournent côté navigateur

Les treize moteurs sont des fonctions pures : elles prennent un objet
d'entrée et rendent un résultat normalisé. Rien à cacher, rien à protéger —
les formules sont publiques, elles viennent d'un dépôt ouvert.

Les exécuter côté client apporte trois choses :

- **pas de latence réseau** — le résultat s'affiche instantanément, ce qui rend
  utilisable l'aperçu de marge en direct sur la fiche produit ;
- **pas de coût** — aucun appel facturé pour un calcul déterministe ;
- **testabilité** — 71 tests vérifient les formules sans infrastructure.

Les données qu'ils consomment, elles, sont lues sous RLS : un compte sans rôle
`staff` ne reçoit rien, quel que soit le code exécuté dans son navigateur.

## Ce qui tourne obligatoirement côté serveur

| Opération | Pourquoi côté serveur |
|---|---|
| Création de commande | Prix, coûts, remise et stock relus en base. Le client n'a pas à être cru sur un montant. |
| Validation d'un code promo | `validate_discount()` est `security definer` : le catalogue des codes n'est jamais exposé. |
| Décrément de stock | Déclenché par le webhook de paiement, pas par le navigateur. |
| Analyse rédigée | La clé Anthropic ne doit jamais atteindre le navigateur. |
| Application d'une approbation | `apply_approval()` revérifie le rôle, la décision et l'expiration avant d'écrire. |
| Automatisations | Besoin du rôle de service pour lire l'ensemble du catalogue et créer alertes et demandes. |

## Base de données

### Catalogue

`products` porte l'économie unitaire : coût d'achat, logistique entrante,
préparation, taux de commission, part publicitaire, taux de retour. C'est
l'entrée de tous les calculs de marge.

`product_variants` × `product_options` × `product_option_values` forment le
modèle de déclinaison. `variant_option_values` relie une variante à ses valeurs
d'options, ce qui permet au sélecteur de la fiche produit de désactiver
exactement les combinaisons qui n'existent pas ou sont épuisées.

`inventory_levels` sépare `on_hand` de `reserved` : une commande en cours de
paiement réserve sans décrémenter. `stock_movements` journalise chaque
variation avec son motif et son auteur.

### Vues de calcul

Ces vues sont la jonction entre la base et les moteurs :

| Vue | Ce qu'elle produit |
|---|---|
| `variant_pricing` | Prix effectif d'une variante (surcharge ou prix de base) |
| `variant_margins` | Marge brute et nette réelles, décomposition de coûts incluse |
| `variant_availability` | Disponible = en stock − réservé, et franchissement de seuil |
| `inventory_health` | Vélocité sur 30 jours, couverture en jours, valeur au coût |
| `product_performance` | Unités, chiffre d'affaires, marge, note moyenne, stock |
| `kpi_daily` | Chiffre d'affaires, marge et panier moyen par jour |
| `shop_public_settings` | Sous-ensemble publiable des paramètres |

`store_unit_economics(jours)` complète l'ensemble : panier moyen, marge de
contribution, taux de réachat, commandes par client.

### Intelligence commerciale

`nexscope_skills` est le registre des 162 modules, alimenté par une migration
générée depuis l'audit. La colonne `instructions` met en cache le `SKILL.md`
récupéré depuis le dépôt public, avec son empreinte SHA-256 et sa date de
récupération.

`skill_runs` conserve chaque analyse : paramètres, contexte figé, résultat du
calcul, rapport rédigé, recommandations, jetons consommés. Une analyse reste
donc relisible et comparable dans le temps.

## Le garde-fou des actions sensibles

C'est la contrainte structurelle du projet, appliquée à trois niveaux.

**Niveau 1 — les moteurs.** Toute recommandation touchant un prix, un budget
publicitaire ou une commande fournisseur porte `requiresApproval: true` et un
`actionType`. Le moteur ne dispose d'aucun moyen d'écrire en base.

**Niveau 2 — les automatisations.** `automation-tick` crée des alertes et des
demandes d'approbation. Elle n'écrit jamais dans `products`, `product_variants`
ni `inventory_levels`.

**Niveau 3 — la base.** `apply_approval()` est le seul chemin d'application.
Elle vérifie, dans cet ordre :

1. l'appelant est administrateur, sinon `42501` ;
2. la demande existe et est verrouillée (`for update`) ;
3. son statut est bien `approved` — une demande non décidée est refusée ;
4. elle n'a pas expiré, sinon elle est marquée `expired`.

Puis elle applique le changement **et enregistre l'état antérieur** :
`price_history` conserve l'ancien prix, le motif, la date et l'auteur ;
`stock_movements` conserve chaque variation. Le retour en arrière est donc
toujours possible.

Les politiques RLS séparent enfin **proposer** de **décider** : l'équipe peut
créer une demande (`status = 'pending'`, `decided_by is null`), seuls les
administrateurs peuvent la mettre à jour.

## Sécurité

- **RLS activée et forcée** sur toutes les tables du schéma `public`.
- **Catalogue publié** lisible de tous ; brouillons réservés à l'équipe.
- **Données client** cloisonnées par `profile_id = auth.uid()`.
- **Panier invité** autorisé par un jeton transmis dans l'en-tête
  `x-cart-token`, vérifié par la politique — un visiteur ne peut pas lire le
  panier d'un autre.
- **Codes de réduction** non listables ; validation par fonction `security
  definer`.
- **Objectifs économiques** (marge cible, coût d'acquisition, charges fixes)
  réservés à l'équipe ; la boutique lit la vue restreinte.
- **Rôle** lu depuis `profiles`, jamais depuis le client. Un utilisateur ne peut
  pas s'élever : la politique d'insertion sur `profiles` exige `is_admin()`.
- **Webhook de paiement** : signature HMAC-SHA256 vérifiée avec tolérance
  d'horodatage et comparaison à temps constant, avant toute écriture.
- **Secrets** : seules les variables `VITE_*` atteignent le navigateur, et elles
  ne contiennent que des clés publiques.

## Choix techniques et leurs raisons

| Choix | Raison |
|---|---|
| Vite plutôt que Next.js | Boutique entièrement dynamique, aucun besoin de rendu serveur. Build de 6 s, déploiement statique. |
| React Router | Routage déclaratif suffisant ; le back-office est isolé derrière un `lazy()`. |
| TanStack Query | Cache, invalidation et états de chargement cohérents sans gestion d'état globale. |
| Zustand pour le panier | Le panier est partagé entre l'en-tête, la fiche produit et le paiement ; un store léger évite de le faire remonter par les props. |
| Recharts | Rendu SVG, accessible, suffisant pour les graphiques du back-office. Chargé uniquement avec l'administration. |
| Types de base écrits à la main | L'application est typée de bout en bout avant même qu'un projet Supabase existe. Régénérables par `npm run db:types`. |

## Découpage du bundle

| Chunk | Poids (gzip) | Quand il est chargé |
|---|---:|---|
| `react` | 54 ko | toujours |
| `index` | 81 ko | toujours — la boutique |
| `AdminApp` | 101 ko | à l'ouverture du back-office |
| `charts` | 118 ko | avec les pages à graphiques |

Un client qui visite la boutique télécharge 135 ko compressés. Les 219 ko du
back-office ne le concernent pas.

## Ce qui reste à faire pour aller plus loin

Points identifiés, volontairement non implémentés faute de données ou de
service à connecter :

- **Mesure d'audience.** Le tunnel de conversion ne peut pas chiffrer les étapes
  « sessions » et « fiches vues ». Les étapes sont transmises à zéro et le
  moteur le signale. Brancher une mesure respectueuse de la vie privée
  compléterait deux des cinq leviers de croissance.
- **Dépense publicitaire.** Sans elle, le coût d'acquisition et le ratio
  LTV / CAC ne sont pas calculables. Une saisie mensuelle suffirait.
- **Collecte automatique des prix concurrents.** La veille fonctionne en saisie
  et en import CSV. Le schéma distingue déjà la source d'un relevé, de sorte
  qu'une API s'y branche sans migration.
- **Bons de commande fournisseur.** Les tables existent
  (`purchase_orders`, `purchase_order_items`) et les recommandations de
  réapprovisionnement produisent déjà le détail des lignes ; l'interface de
  création reste à écrire.
