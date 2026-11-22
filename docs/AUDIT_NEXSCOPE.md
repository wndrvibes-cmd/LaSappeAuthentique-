# Audit du dépôt Nexscope eCommerce-Skills

> Document généré depuis l'inventaire réel du dépôt.
> Régénérer avec `npm run nexscope:sync && node scripts/generate-audit.mjs`.

**Source auditée** : <https://github.com/nexscope-ai/eCommerce-Skills>

## 1. Ce que contient le dépôt

| Mesure | Valeur |
|---|---:|
| Fichiers `SKILL.md` inventoriés | **162** |
| Dossiers de compétences à la racine | 147 |
| Lignes d'instructions cumulées | 18 102 |
| Compétences livrées avec des scripts Python | **22** |
| Scripts Python au total | 42 |
| Configurations d'agent (`agents/openai.yaml`) | 3 |
| Jeux d'évaluation (`evals/evals.json`) | 1 |
| Catégories métier retenues après classement | 14 |

Le dépôt ne contient **aucun binaire, aucune clé API et aucune dépendance
réseau obligatoire**. Chaque compétence est un fichier Markdown décrivant une
méthode d'analyse, parfois accompagné de scripts Python autonomes.

### Trois formats de métadonnées

Point important relevé par l'audit : le dépôt n'utilise **pas un seul format**
de métadonnées. S'en tenir au plus courant laissait 42 modules sur 162 sans
description exploitable — défaut détecté en appliquant réellement le schéma à
une base PostgreSQL, la contrainte `not null` ayant refusé l'insertion.

| Format | Fichiers | Où lire la description |
|---|---:|---|
| Frontmatter plat (`name:` / `description:`) | 120 | dans le frontmatter |
| Frontmatter imbriqué (`nexscope:` { name, category, tags… }) | 16 | **absente** du frontmatter : premier paragraphe du corps |
| Aucun frontmatter | 26 | titre `#` et premier paragraphe |

Le générateur lit les trois. Aucun module n'est enregistré sans description.

### Structure observée

```
<compétence>/
  SKILL.md              instructions (frontmatter YAML + corps Markdown)
  scripts/*.py          algorithmes autonomes (22 compétences sur 162)
  agents/openai.yaml    déclaration d'agent (3 compétences)
  evals/evals.json      jeu d'évaluation (1 compétence)
```

Certaines compétences sont déclinées par canal de vente :
`profit-margin-calculator/` contient par exemple quatre variantes
(`-amazon`, `-shopify`, `-tiktok`, `-walmart`) partageant le même moteur de
calcul avec des tables de frais différentes.

## 2. Classement par fonction commerciale

Le dépôt est organisé par plateforme. Pour une boutique en propre, ce
découpage est peu utile : le classement retenu est **fonctionnel**.

| Catégorie | Modules | Dont avec moteur de calcul |
|---|---:|---:|
| Stocks & Logistique | 19 | 9 |
| Prix & Rentabilité | 18 | 9 |
| Marketing & Acquisition | 18 | 1 |
| SEO & Visibilité | 17 | 9 |
| Veille concurrentielle | 16 | 6 |
| Fidélisation & Relation client | 14 | 5 |
| Conversion & Expérience | 12 | 4 |
| Marque & Réputation | 11 | 2 |
| Recherche produit & Opportunités | 10 | 9 |
| Contenu & Fiches produits | 10 | 2 |
| Canaux & Marketplaces | 7 | 0 |
| Surveillance & Fiabilité | 4 | 0 |
| Analytique & Pilotage | 3 | 3 |
| International & Conformité | 3 | 1 |
| **Total** | **162** | **60** |

### Répartition par canal d'origine

| Canal | Modules |
|---|---:|
| tous canaux | 58 |
| shopify | 31 |
| tiktok-shop | 28 |
| etsy | 22 |
| walmart | 9 |
| ebay | 8 |
| amazon | 5 |
| woocommerce | 1 |

## 3. Dépendances et connexions nécessaires

### 3.1 Aucune dépendance obligatoire

Les scripts Python du dépôt n'utilisent que la bibliothèque standard
(`json`, `csv`, `dataclasses`, `enum`, `re`, `math`, `sys`). Aucun appel
réseau, aucune clé API. C'est ce qui a rendu possible leur portage intégral
en TypeScript : les moteurs tournent dans l'application, sans service tiers.

### 3.2 Modules dépendant de données externes

33 modules sur 162 ne peuvent pas produire d'analyse
complète sans une source de données que le dépôt ne fournit pas. Ils sont
signalés comme tels dans l'application, et leur mode de repli est explicite.

**1. 4 module(s)** — competitor-price-tracker, competitor-price-analysis, walmart-price-tracker, share-of-shelf

> Relevés de prix concurrents : saisie manuelle et import CSV disponibles sans clé. Pour une collecte automatique, connecter une source de données marché (API Nexscope ou équivalent).

**2. 5 module(s)** — review-monitoring, ebay-review-checker, product-review-analysis, amazon-review-checker, walmart-review-checker

> Avis externes : les avis de votre boutique sont analysés nativement. Pour les avis d'une marketplace, importer un export CSV.

**3. 6 module(s)** — ecommerce-ppc-strategy-planner, tiktok-shop-ads, ebay-advertising, etsy-advertising, etsy-offsite-ads, walmart-advertising-strategy

> Données de campagnes : connecter la régie concernée (Google Ads, Meta, TikTok Ads) pour importer les performances réelles. Sans connexion, saisie manuelle des indicateurs.

**4. 9 module(s)** — brand-monitoring, brand-protection-tiktok, brand-protection-amazon, brand-protection-shopify, brand-protection-walmart, online-reputation-management, et 3 autre(s)

> Surveillance web : nécessite une source de veille (API de recherche ou flux). Sans clé, les mentions sont saisies ou importées manuellement.

**5. 3 module(s)** — tiktok-shop-trending-products, ecommerce-keyword-research, etsy-keyword-research

> Volumes de recherche et tendances : connecter une source de données mots-clés pour des chiffres réels. Sans clé, le module travaille sur vos propres données de recherche interne.

**6. 6 module(s)** — synthetic-monitoring, visual-regression-testing, localization-testing, api-monitoring, file-integrity-monitoring, public-status-page

> Supervision technique : nécessite un service de monitoring externe. Module fourni comme cadre d'analyse et de configuration.

### 3.3 MCP

Le dépôt renvoie vers des outils MCP et des API hébergés par Nexscope
(`nexscope.ai/mcp`, `nexscope.ai/api-docs`). Ces services sont **facultatifs** :
aucune compétence n'en dépend pour fonctionner. Ils apporteraient des données
marché (prix concurrents, volumes de recherche) qui, dans cette plateforme,
sont saisies manuellement ou importées par CSV. L'intégration est préparée :
les tables `competitors`, `competitor_products` et `price_observations
distinguent déjà la source d'un relevé (`manual`, `csv_import`, `api`,
`automation`), de sorte qu'une collecte automatique s'y branche sans
modification du schéma.

## 4. Moteurs de calcul portés dans l'application

60 modules s'appuient sur l'un des **13 moteurs déterministes**
portés en TypeScript. Ils s'exécutent dans l'application, sur les données
réelles de la boutique, sans clé API, avec un résultat reproductible.

| Moteur | Source Nexscope | Ce qu'il calcule | Modules desservis |
|---|---|---|---:|
| `profit-margin` | profit-margin-calculator/<canal>/scripts/calculator.py | Décomposition de coûts, marge brute et nette, point mort, grille de prix conseillés | 4 |
| `supply-chain` | supply-chain-optimization/<canal>/scripts/calculator.py | Référentiels par canal, cycle de trésorerie, diagnostic de goulots, EOQ et stock de sécurité | 5 |
| `listing-seo` | etsy-seo/scripts/analyzer.py | Notation pondérée titre 30 % / mots-clés 25 % / description 20 % / attributs 15 % / images 10 % | 9 |
| `dynamic-pricing` | dynamic-pricing-ecommerce/ · competitive-pricing-strategy/ · price-optimization-tool/ · minimum-advertised-price/ | Repricing borné avec prix plancher, approbation obligatoire et conservation de l’état antérieur | 4 |
| `unit-economics` | ecommerce-growth-strategy/SKILL.md · ecommerce-business-plan/ | Économie unitaire (panier moyen, marge de contribution, réachat, CAC, LTV) et chiffrage des cinq leviers | 2 |
| `inventory-forecast` | inventory-tracking-software/ · restock-alert/ · warehouse-optimization/ · shopify-inventory-management/ | Vélocité réelle, couverture, stock de sécurité au taux de service, point de commande, EOQ, classification ABC | 4 |
| `sales-analytics` | sales-tracking-tool/ · shopify-analytics-guide/ · etsy-shop-analytics/ · tiktok-shop-analytics/ | Tendance période sur période, concentration (Pareto et Herfindahl), accélérations, décrochages, anomalies | 4 |
| `review-analysis` | review-checker/<canal>/scripts/analyzer.py · product-review-analysis/ · customer-feedback-analysis/ | Extraction des points de friction et des arguments, détection de similarité, regroupement temporel, polarisation | 6 |
| `cross-border` | cross-border-ecommerce/SKILL.md · shopify-tax-compliance/ · shopify-international/ | Notation de marchés, régimes de TVA, seuils douaniers, suivi du seuil OSS de 10 000 € | 3 |
| `opportunity-score` | dropshipping-product-research/ · market-gap-analysis/ · ebay-product-research/ · product-launch-strategy/ | Notation demande 30 % / concurrence 25 % / marge 30 % / logistique 15 %, avec vérification de rentabilité réelle | 5 |
| `funnel-cro` | conversion-rate-optimization/ · ecommerce-checkout-optimization/ · ecommerce-ab-testing/ · shopify-cart-abandonment/ | Perte chiffrée par étape, frictions structurelles, dimensionnement de test A/B à 95 % / 80 % | 7 |
| `price-tracking` | competitor-price-tracker/ · competitor-price-analysis/ · share-of-shelf/ · walmart-price-tracker/ | Médiane et dispersion des relevés, rang de prix, écarts au-delà du seuil, rejet des relevés périmés | 3 |
| `differentiation` | product-differentiation/<canal>/scripts/analyzer.py | Matrice de comparaison pondérée, avantages, retards, terrains libres, positionnement | 4 |

### Écarts assumés par rapport aux scripts d'origine

Le portage est fidèle aux formules, avec quatre adaptations documentées :

1. **Commission marketplace → commission de paiement.** Les scripts calculent
   une « referral fee » de place de marché. Une boutique en propre paie à la
   place une commission de prestataire de paiement (taux + part fixe). La
   structure du calcul est identique.
2. **Traitement de la TVA.** Les scripts d'origine ignorent la TVA, non
   pertinente sur les marketplaces américaines. Ici, la marge est mesurée sur
   le chiffre d'affaires hors taxes — la TVA collectée n'appartient pas à
   l'entreprise — tandis que la commission du prestataire est prélevée sur le
   montant TTC encaissé. Le taux effectif rapporté au HT vaut donc
   `taux × (1 + TVA)`. C'est ce qui rend le prix plancher et la grille de prix
   conseillés exacts.
3. **Frais FBA → préparation et logistique entrante.** Même rôle dans le
   calcul, nommage adapté au modèle en propre.
4. **Lexiques traduits et adaptés.** Les listes `PAIN_POINT_KEYWORDS` et
   `SELLING_POINT_KEYWORDS` du dépôt sont en anglais et orientées électronique
   grand public. Elles ont été réécrites pour le prêt-à-porter francophone
   (taille, coupe, matière, tombé, entretien) en conservant la méthode.

### Défauts corrigés au passage

Le portage a mis en évidence quatre défauts, corrigés et couverts par des tests :

| Défaut | Conséquence | Correction |
|---|---|---|
| Commission calculée sur le TTC mais marge mesurée sur le HT | Prix plancher et grille de prix faux de 1 à 2 € | Résolution algébrique avec taux effectif `taux × (1 + TVA)` |
| Arrondi psychologique appliqué après le bornage | Une hausse pouvait dépasser la variation maximale autorisée | Arrondi puis re-bornage ; le garde-fou n'est plus seulement indicatif |
| Classification ABC excluant la référence franchissant 80 % | Le premier produit du catalogue pouvait être classé B | Cumul évalué avant ajout, classification inclusive |
| Conflit entre prix plancher et variation maximale | Une proposition passait silencieusement sous le plancher | Conflit signalé explicitement, hausse plafonnée et motif affiché |

## 5. Modules en analyse rédigée

102 modules n'ont pas d'algorithme déterministe : leur valeur réside
dans la méthode décrite en Markdown. Pour eux, la plateforme :

1. récupère le `SKILL.md` **réel** depuis le dépôt public (puis le met en
   cache sept jours dans `nexscope_skills.instructions`) ;
2. le transmet au modèle comme instructions système, avec consigne explicite
   de ne pas y substituer sa propre méthode ;
3. y joint les données réelles de la boutique et, le cas échéant, le résultat
   du moteur de calcul — le modèle interprète, il ne recalcule pas ;
4. enregistre le rapport, les jetons consommés et le contexte utilisé.

Ces modules requièrent `ANTHROPIC_API_KEY`. Sans elle, les
60 modules à moteur de calcul restent pleinement exploitables.

## 6. Inventaire complet

Légende du mode : **C** calcul local · **C+A** calcul puis analyse rédigée ·
**A** analyse rédigée. « Ext. » signale une dépendance à des données externes.

### Analytique & Pilotage

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `ecommerce-business-plan` | C+A | `unit-economics` | — | `ecommerce-business-plan` |
| `sales-tracking-tool` ★ | C+A | `sales-analytics` | — | `sales-tracking-tool` |
| `shopify-analytics-guide` | C+A | `sales-analytics` | — | `shopify-analytics-guide` |

### Canaux & Marketplaces

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `etsy-digital-products` | A | — | — | `etsy-digital-products` |
| `etsy-print-on-demand` | A | — | — | `etsy-print-on-demand` |
| `shopify-app-recommendations` | A | — | — | `shopify-app-recommendations` |
| `shopify-google-channel` | A | — | — | `shopify-google-channel` |
| `shopify-migration` | A | — | — | `shopify-migration` |
| `tiktok-live-selling` | A | — | — | `tiktok-live-selling` |
| `tiktok-shop-content-strategy` | A | — | — | `tiktok-shop-content-strategy` |

### Contenu & Fiches produits

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `ecommerce-landing-page` | A | — | — | `ecommerce-landing-page` |
| `ecommerce-video-marketing` | A | — | — | `ecommerce-video-marketing` |
| `etsy-listing-photography` | A | — | — | `etsy-listing-photography` |
| `etsy-shop-branding` | A | — | — | `etsy-shop-branding` |
| `shopify-landing-page-builder` | A | — | — | `shopify-landing-page-builder` |
| `shopify-product-photography-guide` | A | — | — | `shopify-product-photography-guide` |
| `shoppable-video` | A | — | — | `shoppable-video` |
| `tiktok-shop-ads` | A | — | oui | `tiktok-shop-ads` |
| `tiktok-shop-analytics` | C+A | `sales-analytics` | — | `tiktok-shop-analytics` |
| `tiktok-shop-conversion` | C+A | `funnel-cro` | — | `tiktok-shop-conversion` |

### Conversion & Expérience

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `conversion-rate-optimization` ★ | C+A | `funnel-cro` | — | `conversion-rate-optimization` |
| `ecommerce-checkout-optimization` | C+A | `funnel-cro` | — | `ecommerce-checkout-optimization` |
| `etsy-shop-analytics` | C+A | `sales-analytics` | — | `etsy-shop-analytics` |
| `shopify-checkout-customization` | A | — | — | `shopify-checkout-customization` |
| `shopify-conversion-optimization` | C+A | `funnel-cro` | — | `shopify-conversion-optimization` |
| `shopify-facebook-instagram-shop` | A | — | — | `shopify-facebook-instagram-shop` |
| `shopify-page-speed` | A | — | — | `shopify-page-speed` |
| `shopify-speed-optimization` | A | — | — | `shopify-speed-optimization` |
| `shopify-theme-optimization` | A | — | — | `shopify-theme-optimization` |
| `shopify-upsell-cross-sell` | A | — | — | `shopify-upsell-cross-sell` |
| `synthetic-monitoring` | A | — | oui | `synthetic-monitoring` |
| `visual-regression-testing` | A | — | oui | `visual-regression-testing` |

### Fidélisation & Relation client

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `customer-feedback-analysis` | C+A | `review-analysis` | — | `customer-feedback-analysis` |
| `ebay-review-checker` | C+A | `review-analysis` | oui | `review-checker/ebay-review-checker` |
| `ecommerce-customer-retention` ★ | A | — | — | `ecommerce-customer-retention` |
| `ecommerce-email-marketing-builder` ★ | A | — | — | `ecommerce-email-marketing-builder` |
| `ecommerce-growth-strategy` ★ | C+A | `unit-economics` | — | `ecommerce-growth-strategy` |
| `ecommerce-personalization` | A | — | — | `ecommerce-personalization` |
| `ecommerce-returns-management` | A | — | — | `ecommerce-returns-management` |
| `product-review-analysis` | C+A | `review-analysis` | oui | `product-review-analysis` |
| `shopify-cart-abandonment` | C+A | `funnel-cro` | — | `shopify-cart-abandonment` |
| `shopify-email-flows` | A | — | — | `shopify-email-flows` |
| `shopify-loyalty-program` | A | — | — | `shopify-loyalty-program` |
| `shopify-subscription-setup` | A | — | — | `shopify-subscription-setup` |
| `tiktok-shop-customer-service` | A | — | — | `tiktok-shop-customer-service` |
| `tiktok-shop-returns` | A | — | — | `tiktok-shop-returns` |

### International & Conformité

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `shopify-tax-compliance` | A | — | — | `shopify-tax-compliance` |
| `tiktok-shop-compliance` | A | — | — | `tiktok-shop-compliance` |
| `tiktok-shop-cross-border` | C+A | `cross-border` | — | `tiktok-shop-cross-border` |

### Marketing & Acquisition

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `affiliate-marketing-strategy` | A | — | — | `affiliate-marketing-strategy` |
| `brand-protection-tiktok` | A | — | oui | `brand-protection/brand-protection-tiktok` |
| `ebay-advertising` | A | — | oui | `ebay-advertising` |
| `ecommerce-ppc-strategy-planner` ★ | A | — | oui | `ecommerce-ppc-strategy-planner` |
| `ecommerce-social-media-marketing` | A | — | — | `ecommerce-social-media-marketing` |
| `etsy-advertising` | A | — | oui | `etsy-advertising` |
| `etsy-offsite-ads` | A | — | oui | `etsy-offsite-ads` |
| `etsy-social-media-marketing` | A | — | — | `etsy-social-media-marketing` |
| `influencer-outreach` ★ | A | — | — | `influencer-outreach` |
| `shopify-store-setup` | A | — | — | `shopify-store-setup` |
| `supply-chain-optimization-tiktok` | C+A | `supply-chain` | — | `supply-chain-optimization/supply-chain-optimization-tiktok` |
| `tiktok-creator-marketplace` | A | — | — | `tiktok-creator-marketplace` |
| `tiktok-influencer-marketing` | A | — | — | `tiktok-influencer-marketing` |
| `tiktok-shop-affiliate-program` | A | — | — | `tiktok-shop-affiliate-program` |
| `tiktok-shop-creator-management` | A | — | — | `tiktok-shop-creator-management` |
| `tiktok-shop-seller-guide` | A | — | — | `tiktok-shop-seller-guide` |
| `walmart-advertising-strategy` | A | — | oui | `walmart-advertising-strategy` |
| `walmart-seller-tools` | A | — | — | `walmart-seller-tools` |

### Marque & Réputation

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `amazon-review-checker` | C+A | `review-analysis` | oui | `review-checker/amazon-review-checker` |
| `brand-protection-amazon` | A | — | oui | `brand-protection/brand-protection-amazon` |
| `brand-protection-shopify` | A | — | oui | `brand-protection/brand-protection-shopify` |
| `brand-protection-walmart` | A | — | oui | `brand-protection/brand-protection-walmart` |
| `ecommerce-branding` | A | — | — | `ecommerce-branding` |
| `etsy-multi-shop` | A | — | — | `etsy-multi-shop` |
| `etsy-review-strategy` | A | — | — | `etsy-review-strategy` |
| `online-reputation-management` | A | — | oui | `online-reputation-management` |
| `tiktok-shop-branding` | A | — | — | `tiktok-shop-branding` |
| `tiktok-shop-reviews` | A | — | — | `tiktok-shop-reviews` |
| `walmart-review-checker` | C+A | `review-analysis` | oui | `review-checker/walmart-review-checker` |

### Prix & Rentabilité

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `brand-protection-ebay` | A | — | oui | `brand-protection/brand-protection-ebay` |
| `ebay-seller-guide` | A | — | — | `ebay-seller-guide` |
| `ebay-seller-tools` | A | — | — | `ebay-seller-tools` |
| `ecommerce-ab-testing` | C+A | `funnel-cro` | — | `ecommerce-ab-testing` |
| `ecommerce-subscription-model` | A | — | — | `ecommerce-subscription-model` |
| `etsy-custom-orders` | A | — | — | `etsy-custom-orders` |
| `etsy-seller-guide` | A | — | — | `etsy-seller-guide` |
| `minimum-advertised-price` | C+A | `dynamic-pricing` | — | `minimum-advertised-price` |
| `price-optimization-tool` | C+A | `dynamic-pricing` | — | `price-optimization-tool` |
| `profit-margin-calculator-amazon` | C+A | `profit-margin` | — | `profit-margin-calculator/profit-margin-calculator-amazon` |
| `profit-margin-calculator-shopify` ★ | C+A | `profit-margin` | — | `profit-margin-calculator/profit-margin-calculator-shopify` |
| `profit-margin-calculator-tiktok` | C+A | `profit-margin` | — | `profit-margin-calculator/profit-margin-calculator-tiktok` |
| `profit-margin-calculator-walmart` | C+A | `profit-margin` | — | `profit-margin-calculator/profit-margin-calculator-walmart` |
| `shopify-ab-testing` | C+A | `funnel-cro` | — | `shopify-ab-testing` |
| `shopify-dropshipping` | A | — | — | `shopify-dropshipping` |
| `shopify-international` | C+A | `cross-border` | — | `shopify-international` |
| `shopify-wholesale-channel` | A | — | — | `shopify-wholesale-channel` |
| `tiktok-shop-pricing` | A | — | — | `tiktok-shop-pricing` |

### Recherche produit & Opportunités

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `dropshipping-product-research` ★ | C+A | `opportunity-score` | — | `dropshipping-product-research` |
| `ebay-product-research` | C+A | `opportunity-score` | — | `ebay-product-research` |
| `market-gap-analysis` | C+A | `opportunity-score` | — | `market-gap-analysis` |
| `product-differentiation-amazon` | C+A | `differentiation` | — | `product-differentiation/product-differentiation-amazon` |
| `product-differentiation-ebay` | C+A | `differentiation` | — | `product-differentiation/product-differentiation-ebay` |
| `product-differentiation-shopify` | C+A | `differentiation` | — | `product-differentiation/product-differentiation-shopify` |
| `product-differentiation-tiktok` | C+A | `differentiation` | — | `product-differentiation/product-differentiation-tiktok` |
| `product-launch-strategy` | A | — | — | `product-launch-strategy` |
| `tiktok-shop-product-research` | C+A | `opportunity-score` | — | `tiktok-shop-product-research` |
| `tiktok-shop-trending-products` | C+A | `opportunity-score` | oui | `tiktok-shop-trending-products` |

### SEO & Visibilité

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `ebay-seo` | C+A | `listing-seo` | — | `ebay-seo` |
| `ecommerce-feed-management` | A | — | — | `ecommerce-feed-management` |
| `ecommerce-keyword-research` | A | — | oui | `ecommerce-keyword-research` |
| `etsy-product-description` | A | — | — | `etsy-product-description` |
| `etsy-seo` | C+A | `listing-seo` | — | `etsy-seo` |
| `etsy-seo-tags` | C+A | `listing-seo` | — | `etsy-seo-tags` |
| `etsy-shop-setup` | A | — | — | `etsy-shop-setup` |
| `google-shopping-optimization` | A | — | — | `google-shopping-optimization` |
| `product-page-seo` | C+A | `listing-seo` | — | `product-page-seo` |
| `product-title-optimization` | C+A | `listing-seo` | — | `product-title-optimization` |
| `shopify-blog-strategy` | A | — | — | `shopify-blog-strategy` |
| `shopify-marketing` | A | — | — | `shopify-marketing` |
| `shopify-seo` ★ | C+A | `listing-seo` | — | `shopify-seo` |
| `tiktok-shop-listing-optimization` | C+A | `listing-seo` | — | `tiktok-shop-listing-optimization` |
| `walmart-listing-optimization` | C+A | `listing-seo` | — | `walmart-listing-optimization` |
| `walmart-seller-guide` | A | — | — | `walmart-seller-guide` |
| `woocommerce-seo` | C+A | `listing-seo` | — | `woocommerce-seo` |

### Stocks & Logistique

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `cross-border-ecommerce` ★ | C+A | `cross-border` | — | `cross-border-ecommerce` |
| `ecommerce-shipping-rates` | A | — | — | `ecommerce-shipping-rates` |
| `etsy-seasonal-strategy` | A | — | — | `etsy-seasonal-strategy` |
| `etsy-shipping-strategy` | A | — | — | `etsy-shipping-strategy` |
| `etsy-star-seller` | A | — | — | `etsy-star-seller` |
| `inventory-tracking-software` ★ | C+A | `inventory-forecast` | — | `inventory-tracking-software` |
| `localization-testing` | A | — | oui | `localization-testing` |
| `multichannel-ecommerce` | A | — | — | `multichannel-ecommerce` |
| `omnichannel-ecommerce` | A | — | — | `omnichannel-ecommerce` |
| `restock-alert` | C+A | `inventory-forecast` | — | `restock-alert` |
| `shopify-inventory-management` | C+A | `inventory-forecast` | — | `shopify-inventory-management` |
| `supply-chain-optimization-amazon` | C+A | `supply-chain` | — | `supply-chain-optimization/supply-chain-optimization-amazon` |
| `supply-chain-optimization-shopify` ★ | C+A | `supply-chain` | — | `supply-chain-optimization/supply-chain-optimization-shopify` |
| `supply-chain-optimization-walmart` | C+A | `supply-chain` | — | `supply-chain-optimization/supply-chain-optimization-walmart` |
| `tiktok-shop-fulfillment` | A | — | — | `tiktok-shop-fulfillment` |
| `tiktok-shop-inventory` | C+A | `inventory-forecast` | — | `tiktok-shop-inventory` |
| `tiktok-shop-promotions` | A | — | — | `tiktok-shop-promotions` |
| `tiktok-shop-shipping` | A | — | — | `tiktok-shop-shipping` |
| `warehouse-optimization` | C+A | `supply-chain` | — | `warehouse-optimization` |

### Surveillance & Fiabilité

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `api-monitoring` | A | — | oui | `api-monitoring` |
| `domain-monitoring` | A | — | oui | `domain-monitoring` |
| `file-integrity-monitoring` | A | — | oui | `file-integrity-monitoring` |
| `public-status-page` | A | — | oui | `public-status-page` |

### Veille concurrentielle

| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |
|---|:--:|---|:--:|---|
| `brand-monitoring` ★ | A | — | oui | `brand-monitoring` |
| `competitive-pricing-strategy` | C+A | `dynamic-pricing` | — | `competitive-pricing-strategy` |
| `competitor-price-analysis` | C+A | `price-tracking` | oui | `competitor-price-analysis` |
| `competitor-price-tracker` ★ | C+A | `price-tracking` | oui | `competitor-price-tracker` |
| `dynamic-pricing-ecommerce` ★ | C+A | `dynamic-pricing` | — | `dynamic-pricing-ecommerce` |
| `ecommerce-competitor-analysis` ★ | A | — | — | `ecommerce-competitor-analysis` |
| `ecommerce-content-marketing` | A | — | — | `ecommerce-content-marketing` |
| `ecommerce-marketing-strategy-builder` ★ | A | — | — | `ecommerce-marketing-strategy-builder` |
| `etsy-competitor-analysis` | A | — | — | `etsy-competitor-analysis` |
| `etsy-keyword-research` | A | — | oui | `etsy-keyword-research` |
| `etsy-pricing-strategy` | A | — | — | `etsy-pricing-strategy` |
| `product-description-generator` ★ | A | — | — | `product-description-generator` |
| `review-monitoring` ★ | C+A | `review-analysis` | oui | `review-monitoring` |
| `share-of-shelf` | A | — | oui | `share-of-shelf` |
| `social-media-monitor` | A | — | oui | `social-media-monitor` |
| `walmart-price-tracker` | C+A | `price-tracking` | oui | `walmart-price-tracker` |

★ module mis en avant dans l'interface.

## 7. Conclusion de l'audit

Les 162 compétences du dépôt ont été inventoriées et enregistrées comme
modules de la plateforme. Aucune n'a été écartée : celles qui ne peuvent pas
produire une analyse complète sans données externes sont enregistrées avec la
mention exacte de ce qu'il faut connecter et de leur mode de repli.

Le dépôt se prête bien à cette intégration pour trois raisons :

- **les scripts sont autonomes** — bibliothèque standard uniquement, donc
  portables sans service tiers ;
- **les méthodes sont explicites** — seuils, pondérations et référentiels sont
  écrits en clair, donc vérifiables et testables ;
- **la prudence y est déjà inscrite** — le module de repricing exige
  explicitement « safe bounds, approvals, and rollback », principe retenu
  comme règle structurelle de toute la plateforme.

Ce que la plateforme ajoute au dépôt : l'accès aux **données réelles**. Les
scripts d'origine attendent des chiffres saisis à la main ; ici, prix, coûts,
ventes, stocks, avis et relevés concurrents sont lus en base. C'est ce qui
transforme un conseil générique en diagnostic sur votre boutique.
