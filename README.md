# La Sappe Authentique

Plateforme e-commerce complète : boutique en ligne, back-office de gestion et
moteur d'intelligence commerciale construit sur les 162 compétences du dépôt
[nexscope-ai/eCommerce-Skills](https://github.com/nexscope-ai/eCommerce-Skills).

---

## Ce qui est livré

### Boutique

Accueil éditorial · catalogue avec filtres taille, couleur, prix et
disponibilité · fiche produit avec sélection de variante refusant les
combinaisons inexistantes ou épuisées · panier persistant (connecté **et**
invité, fusionné à la connexion) · favoris · comptes clients et adresses ·
tunnel de paiement · codes de réduction · avis clients · pages livraison,
guide des tailles, entretien, mentions légales, confidentialité, CGV.

### Back-office

Tableau de bord · statistiques commerciales · produits avec **calcul de marge
en direct** et grille de prix conseillés · catégories · stocks avec vélocité et
couverture réelles · commandes avec marge réalisée figée à l'achat · clients et
rôles · codes de réduction · fournisseurs et conditions de paiement · avis à
modérer · paramètres.

### Intelligence commerciale

Les 162 modules Nexscope, filtrables par catégorie, mode d'exécution et
dépendance externe. **60 d'entre eux s'appuient sur l'un des 13 moteurs de
calcul** portés en TypeScript depuis les scripts Python du dépôt : ils
s'exécutent dans l'application, sur vos données réelles, sans aucune clé API.

| Moteur | Ce qu'il calcule |
|---|---|
| Rentabilité | Décomposition du prix, marge brute et nette, prix plancher, grille de prix conseillés |
| Chaîne d'approvisionnement | Cycle de trésorerie, goulots, quantité économique de commande |
| SEO de fiche | Note pondérée titre / mots-clés / description / attributs / images |
| Repricing encadré | Ajustements bornés, prix plancher, approbation obligatoire |
| Croissance | Économie unitaire et chiffrage des cinq leviers |
| Stocks | Vélocité, stock de sécurité, point de commande, classification ABC |
| Ventes | Tendance, concentration, accélérations, décrochages, anomalies |
| Avis clients | Points de friction, arguments confirmés, signaux d'authenticité |
| International | Notation de marchés, TVA, douane, seuil OSS |
| Opportunité produit | Notation sur quatre axes avec vérification de rentabilité |
| Tunnel de conversion | Perte chiffrée par étape, dimensionnement de test A/B |
| Veille des prix | Médiane, rang, écarts, rejet des relevés périmés |
| Différenciation | Matrice pondérée, avantages, retards, terrains libres |

### Automatisation

Automatisations planifiables, alertes, historique d'exécution et file
d'approbation. **Aucune action sensible — prix, budget publicitaire, commande
fournisseur, envoi de masse — n'est exécutée sans votre validation explicite.**
L'état antérieur est conservé, le retour en arrière toujours possible.

---

## Installation

### 1. Dépendances

```bash
npm install
```

### 2. Projet Supabase

Créez un projet sur [supabase.com](https://supabase.com), puis :

```bash
cp .env.example .env
```

Renseignez dans `.env` :

```
VITE_SUPABASE_URL=https://votre-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhb...
VITE_SITE_URL=http://localhost:5173
```

Ces deux valeurs se trouvent dans **Project Settings → API**. La clé `anon`
est publique par conception : elle ne donne accès qu'à ce que les politiques
RLS autorisent.

### 3. Schéma de base

```bash
npx supabase link --project-ref VOTRE_REF
npx supabase db push
```

Les onze migrations créent 41 tables, 7 vues de calcul, les fonctions métier,
les politiques RLS, les buckets de stockage et **le registre des 162 modules
Nexscope**.

### 4. Catalogue de démonstration — facultatif

```bash
# En local
npx supabase db reset          # applique aussi supabase/seed.sql

# Sur le projet distant : coller supabase/seed.sql dans l'éditeur SQL
```

Le fichier `supabase/seed.sql` contient **12 produits d'exemple** avec leurs
variantes, stocks, coûts et fournisseurs. Il est clairement identifié comme jeu
de démonstration : aucun produit ni partenaire n'y est réel. **Pour démarrer
avec une boutique vide, ne l'exécutez pas.**

### 5. Premier administrateur

Inscrivez-vous sur `/inscription`, puis dans l'éditeur SQL Supabase :

```sql
update public.profiles set role = 'admin' where email = 'vous@exemple.fr';
```

Le back-office devient accessible sur `/admin`.

### 6. Lancer

```bash
npm run dev
```

À ce stade, **tout fonctionne sans aucune autre clé** : catalogue, panier,
comptes, commandes en attente de règlement, back-office complet, et les
60 modules à moteur de calcul.

---

## Ce qu'il faut connecter, et ce qui marche sans

### Obligatoire

| Service | Variables | Sans lui |
|---|---|---|
| **Supabase** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Rien ne fonctionne. L'application affiche un écran d'installation plutôt qu'une boutique vide. |

### Facultatif

Les secrets d'Edge Function se définissent ainsi — ils n'atteignent **jamais**
le navigateur :

```bash
npx supabase secrets set NOM=valeur
```

#### Paiement — Stripe

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase functions deploy checkout
npx supabase functions deploy stripe-webhook
```

Ajoutez aussi `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...` dans `.env`.

Dans le tableau de bord Stripe → **Developers → Webhooks**, créez un point de
terminaison vers `https://VOTRE-REF.supabase.co/functions/v1/stripe-webhook`
en écoutant : `checkout.session.completed`, `checkout.session.expired`,
`payment_intent.payment_failed`, `charge.refunded`.

> **Sans Stripe** : les commandes sont enregistrées en attente de règlement et
> le client en est informé explicitement sur la page de confirmation. Aucun
> paiement n'est simulé.

#### Analyses rédigées — Anthropic

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy skill-run
```

> **Sans cette clé** : les 60 modules à moteur de calcul fonctionnent
> normalement — chiffres, constats et recommandations sont produits localement.
> Seule la rédaction de l'analyse est indisponible, et l'interface le dit.

#### Emails transactionnels — Resend

```bash
npx supabase secrets set RESEND_API_KEY=re_...
npx supabase secrets set SHOP_EMAIL_FROM="La Sappe Authentique <commandes@votredomaine.fr>"
```

> **Sans cette clé** : les emails sont consignés dans `email_log` avec le statut
> `queued` et le motif. Rien n'est envoyé, et rien ne prétend l'avoir été.

#### Automatisations planifiées

```bash
npx supabase secrets set CRON_SECRET="$(openssl rand -hex 24)"
npx supabase functions deploy automation-tick
```

Puis, **une seule fois**, dans l'éditeur SQL :

```sql
select app.enable_automation_schedule(
  'https://VOTRE-REF.supabase.co',
  'LE_MEME_CRON_SECRET'
);
```

La tâche s'exécute toutes les quinze minutes et ne traite que les
automatisations réellement dues. Pour l'arrêter :
`select app.disable_automation_schedule();`

> **Sans planification** : les automatisations restent déclenchables à la main
> depuis le back-office, bouton « Exécuter ».

#### Données marché — facultatif

`NEXSCOPE_API_KEY`, `SERPAPI_KEY` : collecte automatique des prix concurrents
et des volumes de recherche.

> **Sans ces clés** : la veille fonctionne par saisie manuelle et import CSV
> (colonnes `concurrent ; titre ; prix ; port`). Les modules concernés signalent
> ouvertement les données absentes au lieu de les estimer.

---

## Déploiement

### Vercel

```bash
npm i -g vercel
vercel
```

Définissez dans **Project Settings → Environment Variables** :
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`
(l'URL de production), et `VITE_STRIPE_PUBLISHABLE_KEY` le cas échéant.

`vercel.json` configure déjà la réécriture SPA, le cache immuable des assets et
les en-têtes de sécurité.

### Edge Functions

```bash
npx supabase functions deploy checkout
npx supabase functions deploy skill-run
npx supabase functions deploy automation-tick
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

> `--no-verify-jwt` uniquement pour le webhook : Stripe n'envoie pas de jeton
> Supabase. Sa sécurité repose sur la vérification de signature HMAC.

---

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (`tsc -b && vite build`) |
| `npm run preview` | Prévisualisation du build |
| `npm test` | 71 tests des moteurs de calcul |
| `./scripts/test-db.sh` | Applique le schéma sur une base jetable et lance 37 tests de sécurité |
| `npm run typecheck` | Vérification de types |
| `npm run db:types` | Régénère `src/types/database.ts` depuis le schéma |
| `npm run nexscope:sync` | Régénère le registre depuis un clone du dépôt |

Pour régénérer le registre et l'audit après une mise à jour du dépôt Nexscope :

```bash
git clone --depth 1 https://github.com/nexscope-ai/eCommerce-Skills.git .nexscope-src
npm run nexscope:sync
node scripts/generate-audit.mjs
```

---

## Structure

```
docs/
  AUDIT_NEXSCOPE.md        audit complet des 162 compétences
  ARCHITECTURE.md          architecture technique et choix
scripts/
  generate-registry.mjs    registre + migration de seed, depuis le dépôt réel
  generate-audit.mjs       rapport d'audit, depuis le registre
supabase/
  migrations/              11 migrations : schéma, RLS, vues, registre
  seed.sql                 catalogue de démonstration (facultatif)
  functions/               checkout · skill-run · automation-tick · stripe-webhook
src/
  lib/nexscope/
    engines/               13 moteurs de calcul déterministes
    context.ts             pont entre la base et les moteurs
    registry.ts            registre des 162 modules
  components/              primitives d'interface, boutique, back-office
  pages/shop/              boutique
  pages/admin/             back-office
tests/
  engines.test.ts          71 tests des formules
  sql/rls.test.sql         37 tests de sécurité de la base
```

---

## À compléter avant l'ouverture au public

Trois pages contiennent des informations qui dépendent de votre structure et
**doivent être renseignées** — elles affichent actuellement un avertissement :

- `/mentions-legales` — raison sociale, SIREN, siège, hébergeur, médiateur de
  la consommation ;
- `/confidentialite` — base légale et durées de conservation ;
- `/cgv` — à faire relire par un professionnel du droit.

Les taux de TVA et seuils douaniers du module d'expansion internationale sont
des **valeurs de cadrage** intégrées à l'application. Elles évoluent : faites-les
vérifier avant toute mise en vente à l'étranger.

---

## Licence

Code de la plateforme : propriété du commanditaire.
Compétences Nexscope : voir la licence du
[dépôt d'origine](https://github.com/nexscope-ai/eCommerce-Skills).
