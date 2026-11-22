import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Heart, Search } from 'lucide-react';
import { useCatalog, useShopSettings } from '@/hooks/useShop';
import { useAuth } from '@/hooks/useAuth';
import { useWishlist } from '@/hooks/useShop';
import { useCart } from '@/store/cart';
import { ProductCard, ProductCardSkeleton } from '@/components/shop/ProductCard';
import { Button, ButtonLink, Card, EmptyState, Input, LoadingBlock, Notice } from '@/components/ui';
import { debounce } from '@/lib/utils';

/* ───────────────────────────── Recherche ─────────────────────────────── */

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [input, setInput] = useState(initial);
  const [query, setQuery] = useState(initial);

  const commit = debounce((value: string) => {
    setQuery(value);
    if (value) setParams({ q: value }, { replace: true });
    else setParams({}, { replace: true });
  }, 350);

  const { data: items, isLoading } = useCatalog({ search: query, sort: 'featured' });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-display text-display-md font-semibold text-ink">Rechercher</h1>

      <div className="relative mt-7 max-w-xl">
        <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-ink-400" aria-hidden />
        <Input
          autoFocus
          className="h-12 pl-11 text-base"
          placeholder="Une pièce, une matière, une couleur…"
          value={input}
          onChange={(e) => { setInput(e.target.value); commit(e.target.value); }}
          aria-label="Rechercher une pièce"
        />
      </div>

      {!query ? (
        <p className="mt-8 text-[0.875rem] text-ink-400">
          Saisissez un mot : nom de pièce, matière (« laine », « lin »), ou couleur.
        </p>
      ) : isLoading ? (
        <div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : items?.length ? (
        <>
          <p className="mt-8 text-[0.8125rem] text-ink-400">
            {items.length} résultat{items.length > 1 ? 's' : ''} pour « {query} »
          </p>
          <div className="mt-6 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => <ProductCard key={item.product.id} item={item} />)}
          </div>
        </>
      ) : (
        <EmptyState
          className="mt-8"
          title={`Aucun résultat pour « ${query} »`}
          description="Essayez un terme plus général, ou parcourez le vestiaire par catégorie."
          action={<ButtonLink to="/boutique" variant="secondary">Tout le vestiaire</ButtonLink>}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── Favoris ──────────────────────────────── */

export function WishlistPage() {
  const { user, loading } = useAuth();
  const { data: items, isLoading } = useWishlist(user?.id);

  if (loading) return <LoadingBlock />;
  if (!user) return <Navigate to="/connexion?suite=/favoris" replace />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <p className="eyebrow">Sélection personnelle</p>
      <h1 className="mt-3 text-display-md font-semibold text-ink">Mes favoris</h1>

      {isLoading ? (
        <LoadingBlock />
      ) : items?.length ? (
        <div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => <ProductCard key={item.product.id} item={item} />)}
        </div>
      ) : (
        <EmptyState
          className="mt-8"
          icon={<Heart className="h-9 w-9" />}
          title="Aucun favori"
          description="Le cœur sur une fiche produit ajoute la pièce ici."
          action={<ButtonLink to="/boutique">Parcourir le vestiaire</ButtonLink>}
        />
      )}
    </div>
  );
}

/* ──────────────────────── Confirmation de commande ───────────────────── */

export function OrderConfirmedPage() {
  const [params] = useSearchParams();
  const orderNumber = params.get('numero');
  const mode = params.get('mode');
  const { clear } = useCart();
  const { data: settings } = useShopSettings();

  // Le panier est vidé à l'arrivée sur la confirmation
  useEffect(() => { void clear(); }, [clear]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-signal-success" aria-hidden />
      <h1 className="mt-6 font-display text-display-md font-semibold text-ink">
        Merci pour votre commande
      </h1>

      {orderNumber && (
        <p className="mt-3 text-[0.9375rem] text-ink-500">
          Votre commande <span className="font-mono font-medium text-ink">{orderNumber}</span>{' '}
          a bien été enregistrée.
        </p>
      )}

      {mode === 'manual' && (
        <Notice tone="warning" className="mt-7 text-left" title="Règlement à finaliser">
          Aucun prestataire de paiement n'est encore raccordé à la boutique : votre
          commande est enregistrée en attente de règlement. Nous vous contactons
          par email pour finaliser le paiement.
        </Notice>
      )}

      <p className="mt-6 text-[0.875rem] leading-relaxed text-ink-500">
        Un email de confirmation vous est envoyé
        {settings?.contact_email && <> depuis {settings.contact_email}</>}. Vous
        pouvez suivre l'avancement depuis votre compte.
      </p>

      <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink to="/compte?onglet=commandes">Suivre ma commande</ButtonLink>
        <ButtonLink to="/boutique" variant="secondary">Continuer mes achats</ButtonLink>
      </div>
    </div>
  );
}

/* ────────────────────── Pages d'information ─────────────────────────── */

function InfoPage({ eyebrow, title, children }: {
  eyebrow: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 text-display-md font-semibold text-balance text-ink">{title}</h1>
      <div className="prose-sappe mt-8">{children}</div>
    </div>
  );
}

export function ShippingPage() {
  const { data: settings } = useShopSettings();
  const free = settings?.free_shipping_above;
  return (
    <InfoPage eyebrow="Service" title="Livraison et retours">
      <h2>Expédition</h2>
      <p>
        Les commandes passées avant 14 h un jour ouvré sont préparées le jour même et
        remises au transporteur sous 24 h ouvrées. Vous recevez un numéro de suivi dès
        la prise en charge du colis.
      </p>
      {free && (
        <p>
          La livraison est <strong>offerte à partir de {Number(free)} €</strong> d'achat
          en France métropolitaine. En dessous de ce montant, et pour les autres
          destinations, les tarifs exacts s'affichent à l'étape de paiement, avant
          validation : aucun frais n'apparaît à la dernière seconde.
        </p>
      )}
      <h2>Retours</h2>
      <p>
        Vous disposez de <strong>30 jours</strong> à compter de la réception pour nous
        retourner une pièce, sans avoir à motiver votre décision. La pièce doit être
        non portée, dans son état d'origine, avec ses étiquettes.
      </p>
      <p>
        Pour engager un retour, écrivez-nous depuis votre compte ou à{' '}
        {settings?.contact_email ?? 'contact@lasappeauthentique.fr'} en précisant votre
        numéro de commande. Nous vous transmettons une étiquette et les instructions.
      </p>
      <h2>Échanges de taille</h2>
      <p>
        Si la taille ne convient pas, nous procédons à un échange plutôt qu'à un
        remboursement lorsque la taille souhaitée est disponible : c'est plus rapide
        pour vous. Signalez-le dans votre demande.
      </p>
      <h2>Droit de rétractation</h2>
      <p>
        Conformément aux articles L221-18 et suivants du code de la consommation, vous
        disposez d'un délai légal de quatorze jours pour exercer votre droit de
        rétractation. Notre politique de 30 jours est plus favorable et s'y substitue.
      </p>
    </InfoPage>
  );
}

export function SizeGuidePage() {
  return (
    <InfoPage eyebrow="Conseil" title="Guide des tailles">
      <p>
        Les mensurations ci-dessous sont celles du <strong>vêtement mesuré à plat</strong>,
        et non celles du corps. C'est la méthode la plus fiable pour comparer avec une
        pièce que vous possédez déjà et qui vous va bien.
      </p>

      <h2>Hauts — chemises, pulls, vestes</h2>
      <table>
        <thead>
          <tr><th>Taille</th><th>Tour de poitrine</th><th>Épaules</th><th>Longueur de manche</th></tr>
        </thead>
        <tbody>
          <tr><td>S</td><td>96 – 100 cm</td><td>43 cm</td><td>63 cm</td></tr>
          <tr><td>M</td><td>100 – 104 cm</td><td>44,5 cm</td><td>64,5 cm</td></tr>
          <tr><td>L</td><td>104 – 110 cm</td><td>46 cm</td><td>66 cm</td></tr>
          <tr><td>XL</td><td>110 – 116 cm</td><td>47,5 cm</td><td>67 cm</td></tr>
          <tr><td>XXL</td><td>116 – 122 cm</td><td>49 cm</td><td>68 cm</td></tr>
        </tbody>
      </table>

      <h2>Pantalons</h2>
      <table>
        <thead>
          <tr><th>Taille</th><th>Tour de taille</th><th>Entrejambe</th></tr>
        </thead>
        <tbody>
          <tr><td>38</td><td>76 cm</td><td>82 cm</td></tr>
          <tr><td>40</td><td>80 cm</td><td>83 cm</td></tr>
          <tr><td>42</td><td>84 cm</td><td>84 cm</td></tr>
          <tr><td>44</td><td>88 cm</td><td>85 cm</td></tr>
          <tr><td>46</td><td>94 cm</td><td>86 cm</td></tr>
          <tr><td>48</td><td>100 cm</td><td>86 cm</td></tr>
        </tbody>
      </table>

      <h2>Chapeaux</h2>
      <p>
        La taille correspond au tour de tête en centimètres, mesuré à mi-hauteur du
        front, juste au-dessus des oreilles. En cas d'hésitation entre deux tailles,
        prenez la plus grande : une bande de réduction permet d'ajuster.
      </p>

      <h2>En cas de doute</h2>
      <p>
        Écrivez-nous en indiquant votre taille habituelle et la marque de référence :
        nous comparons les patronages et vous répondons avec une recommandation
        précise. C'est gratuit, et cela évite un retour.
      </p>
    </InfoPage>
  );
}

export function CarePage() {
  return (
    <InfoPage eyebrow="Entretien" title="Faire durer ses pièces">
      <h2>Laine</h2>
      <p>
        La laine se nettoie peu. Brossez après chaque port dans le sens du poil, puis
        laissez reposer la pièce 24 heures sur un cintre large avant de la remettre :
        les fibres reprennent leur forme seules. Un nettoyage à sec par saison suffit —
        au-delà, les solvants fatiguent l'étoffe.
      </p>
      <h2>Coton et lin</h2>
      <p>
        Lavage à 30 °C, à l'envers, essorage modéré. Séchage à l'air libre sur cintre :
        le sèche-linge raccourcit les fibres et use les cols. Repassez le lin encore
        légèrement humide.
      </p>
      <h2>Cuir</h2>
      <p>
        Mettez des embauchoirs en bois dès le retrait des chaussures : ils absorbent
        l'humidité et préservent la forme. Crème nourrissante tous les dix ports,
        cirage ponctuel. Alternez les paires : un cuir a besoin de 24 heures pour
        sécher complètement.
      </p>
      <h2>Réparer plutôt que remplacer</h2>
      <p>
        Nos chaussures sont ressemelables et nos vestes retouchables. Un bouton perdu,
        une couture ouverte, une semelle usée : écrivez-nous, nous vous orientons vers
        un artisan plutôt que vers un nouvel achat.
      </p>
    </InfoPage>
  );
}

export function LegalPage() {
  const { data: settings } = useShopSettings();
  return (
    <InfoPage eyebrow="Informations" title="Mentions légales">
      <Notice tone="warning" title="À compléter avant la mise en ligne">
        Les mentions légales sont obligatoires et propres à votre structure. Les
        champs ci-dessous doivent être renseignés avec vos informations réelles
        (raison sociale, SIREN, adresse, hébergeur, médiateur de la consommation)
        avant l'ouverture de la boutique au public.
      </Notice>
      <h2>Éditeur du site</h2>
      <p>
        Dénomination : {settings?.shop_name ?? 'La Sappe Authentique'}<br />
        Forme juridique : <em>à compléter</em><br />
        Siège social : <em>à compléter</em><br />
        SIREN / RCS : <em>à compléter</em><br />
        Numéro de TVA intracommunautaire : <em>à compléter</em><br />
        Courriel : {settings?.contact_email ?? 'à compléter'}
      </p>
      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par Vercel Inc. et les données applicatives par Supabase.
        Les coordonnées complètes de ces prestataires doivent figurer ici.
      </p>
      <h2>Médiation de la consommation</h2>
      <p>
        Conformément à l'article L612-1 du code de la consommation, le nom et les
        coordonnées du médiateur auquel vous adhérez doivent être indiqués ici.
      </p>
    </InfoPage>
  );
}

export function PrivacyPage() {
  const { data: settings } = useShopSettings();
  return (
    <InfoPage eyebrow="Informations" title="Protection des données">
      <Notice tone="warning" title="À faire valider">
        Ce texte décrit fidèlement le fonctionnement technique de la boutique. Il doit
        néanmoins être relu et complété (base légale, durées exactes, sous-traitants)
        au regard de votre situation avant publication.
      </Notice>
      <h2>Données collectées</h2>
      <p>Nous traitons uniquement les données nécessaires à la vente :</p>
      <ul>
        <li>identité et coordonnées : nom, adresse email, téléphone, adresses de livraison et de facturation ;</li>
        <li>commandes : pièces commandées, montants, statut de paiement et de livraison ;</li>
        <li>compte : mot de passe (stocké sous forme chiffrée, jamais en clair) ;</li>
        <li>consentement : votre choix concernant les communications commerciales.</li>
      </ul>
      <h2>Paiement</h2>
      <p>
        Aucune donnée bancaire ne transite par nos serveurs ni n'y est conservée. Le
        paiement est traité par un prestataire agréé qui reçoit directement les
        informations de carte.
      </p>
      <h2>Vos droits</h2>
      <p>
        Vous pouvez accéder à vos données, les rectifier, les faire effacer, en demander
        la portabilité, ou vous opposer à leur traitement. Écrivez à{' '}
        {settings?.contact_email ?? 'contact@lasappeauthentique.fr'} : nous répondons
        sous un mois. Vous pouvez également saisir la CNIL.
      </p>
      <h2>Mesure d'audience</h2>
      <p>
        La boutique ne dépose aucun cookie publicitaire ni traceur tiers. Seuls les
        cookies strictement nécessaires au fonctionnement (session, panier) sont
        utilisés : ils ne requièrent pas de consentement.
      </p>
    </InfoPage>
  );
}

export function TermsPage() {
  const { data: settings } = useShopSettings();
  return (
    <InfoPage eyebrow="Informations" title="Conditions générales de vente">
      <Notice tone="warning" title="À faire valider juridiquement">
        Ces conditions reprennent fidèlement le fonctionnement de la boutique, mais
        doivent être relues et complétées par un professionnel du droit avant
        l'ouverture au public.
      </Notice>
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions régissent les ventes conclues sur ce site entre
        {' '}{settings?.shop_name ?? 'La Sappe Authentique'} et tout acheteur.
      </p>
      <h2>2. Prix</h2>
      <p>
        Les prix sont indiqués en euros, toutes taxes comprises
        {settings?.vat_rate ? ` (TVA ${Math.round(Number(settings.vat_rate) * 100)} %)` : ''}.
        Les frais de livraison sont indiqués avant la validation de la commande.
      </p>
      <h2>3. Commande</h2>
      <p>
        La commande est ferme après validation du paiement. Un email récapitulatif vous
        est adressé. Nous nous réservons la possibilité d'annuler une commande en cas
        d'indisponibilité constatée, avec remboursement intégral.
      </p>
      <h2>4. Livraison</h2>
      <p>
        Les délais annoncés sont des délais de préparation et d'acheminement estimés,
        exprimés en jours ouvrés. Un retard de livraison n'ouvre pas droit à annulation
        au-delà des dispositions légales applicables.
      </p>
      <h2>5. Rétractation et retours</h2>
      <p>
        Vous disposez de 30 jours pour retourner une pièce non portée. Les modalités
        figurent sur la page <Link to="/livraison">Livraison et retours</Link>.
      </p>
      <h2>6. Garanties légales</h2>
      <p>
        Toutes nos pièces bénéficient de la garantie légale de conformité et de la
        garantie contre les vices cachés, dans les conditions prévues par la loi.
      </p>
    </InfoPage>
  );
}

/* ─────────────────────── Page d'installation ────────────────────────── */

/** Affichée quand la connexion à Supabase n'est pas configurée. */
export function SetupRequiredPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-16">
      <p className="eyebrow">Installation</p>
      <h1 className="mt-3 text-display-md font-semibold text-ink">
        La boutique n'est pas encore raccordée
      </h1>
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-500">
        L'application fonctionne, mais aucun projet Supabase n'est configuré : elle
        n'a donc ni catalogue, ni comptes, ni commandes à afficher. Plutôt que de
        montrer des données fictives, voici ce qu'il reste à faire.
      </p>

      <Card className="mt-8 p-6">
        <ol className="space-y-5 text-[0.875rem]">
          {[
            ['Créer un projet Supabase', 'Sur supabase.com, créez un projet. Notez son URL et sa clé « anon / publishable ».'],
            ['Renseigner les variables', 'Copiez .env.example vers .env, puis renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.'],
            ['Appliquer les migrations', 'Exécutez supabase link puis supabase db push pour créer le schéma, les vues et les politiques de sécurité.'],
            ['Charger le registre Nexscope', 'La migration 20260101000900 enregistre les 162 modules du dépôt. Elle est appliquée automatiquement.'],
            ['Jeu de démonstration (facultatif)', 'Exécutez supabase/seed.sql pour obtenir un catalogue d’exemple, ou créez directement vos vrais produits.'],
            ['Se nommer administrateur', "Après inscription, passez votre profil en rôle « admin » dans la table profiles pour accéder au back-office."],
          ].map(([title, detail], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.6875rem] font-bold text-ivory">
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-ink">{title}</p>
                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-500">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <p className="mt-6 text-[0.8125rem] text-ink-400">
        Le détail complet, y compris les clés optionnelles (paiement, emails,
        intelligence commerciale), figure dans le fichier <code>README.md</code> du
        projet.
      </p>

      <Button className="mt-8 self-start" variant="secondary" onClick={() => window.location.reload()}>
        Recharger après configuration
      </Button>
    </div>
  );
}
