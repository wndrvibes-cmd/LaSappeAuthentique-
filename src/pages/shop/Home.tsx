import { Link } from 'react-router-dom';
import { ArrowRight, Package, RotateCcw, Scissors, ShieldCheck } from 'lucide-react';
import { useCategories, useFeaturedProducts, useShopSettings } from '@/hooks/useShop';
import { ProductCard, ProductCardSkeleton } from '@/components/shop/ProductCard';
import { ButtonLink } from '@/components/ui';
import { productImageUrl } from '@/lib/supabase';
import { formatPrice } from '@/lib/format';

/* ─────────────────────────────── Hero ──────────────────────────────────
   Composition éditoriale plutôt que carrousel : un titre qui tient la
   page, une accroche courte, deux chemins d'entrée. Le visuel est celui
   de la première pièce mise en avant — donc une vraie image du catalogue,
   pas une illustration décorative sans rapport. */

function Hero() {
  const { data: settings } = useShopSettings();
  const { data: featured } = useFeaturedProducts(1);
  const hero = featured?.[0];
  const image = productImageUrl(hero?.imagePath);

  return (
    <section className="relative overflow-hidden border-b border-ivory-300 bg-ivory">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:py-24">
        <div className="lg:col-span-6 xl:col-span-5">
          <p className="eyebrow animate-fade-up">Maison de vêtements</p>
          <h1 className="mt-5 animate-fade-up text-display-xl font-semibold text-balance text-ink"
              style={{ animationDelay: '60ms' }}>
            L'élégance<br />
            <span className="italic text-brass-dark">se porte</span><br />
            au quotidien
          </h1>
          <p className="mt-6 max-w-md animate-fade-up text-[0.9375rem] leading-relaxed text-ink-500"
             style={{ animationDelay: '120ms' }}>
            {settings?.tagline ?? 'Pièces de caractère, matières nobles, coupes soignées.'}{' '}
            Chaque pièce est choisie pour tenir dans le temps — la coupe d'abord,
            l'étoffe ensuite, et rien qui ne se justifie.
          </p>
          <div className="mt-9 flex animate-fade-up flex-col gap-3 sm:flex-row"
               style={{ animationDelay: '180ms' }}>
            <ButtonLink to="/boutique" size="lg" icon={<ArrowRight className="h-4 w-4" />}>
              Découvrir le vestiaire
            </ButtonLink>
            <ButtonLink to="/categorie/costumes-vestes" size="lg" variant="secondary">
              Costumes & vestes
            </ButtonLink>
          </div>

          <dl className="mt-12 grid animate-fade-up grid-cols-3 gap-6 border-t border-ivory-300 pt-7"
              style={{ animationDelay: '240ms' }}>
            {[
              ['Matières', 'Laine, lin, coton peigné'],
              ['Ateliers', 'France, Portugal, Italie'],
              ['Retouches', 'Conseil offert'],
            ].map(([term, desc]) => (
              <div key={term}>
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-brass-dark">
                  {term}
                </dt>
                <dd className="mt-1.5 text-[0.8125rem] leading-snug text-ink-500">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-6 xl:col-span-7">
          <div className="relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-ivory-200 sm:aspect-[5/4] lg:aspect-[4/5]">
              {image ? (
                <img src={image} alt={hero?.product.name ?? ''} className="h-full w-full object-cover"
                     loading="eager" decoding="async" />
              ) : (
                <div className="grain flex h-full flex-col items-center justify-center gap-3 bg-ink text-center">
                  <Scissors className="h-8 w-8 text-brass" aria-hidden />
                  <p className="font-display text-xl text-ivory">La Sappe Authentique</p>
                  <p className="max-w-xs px-6 text-[0.8125rem] text-ivory/50">
                    Les visuels de la collection apparaîtront ici dès l'ajout
                    des photographies depuis l'administration.
                  </p>
                </div>
              )}
            </div>

            {hero && (
              <Link
                to={`/produit/${hero.product.slug}`}
                className="absolute -bottom-5 left-4 right-4 flex items-center justify-between gap-4 rounded border border-ivory-300 bg-white/95 px-5 py-4 shadow-lift backdrop-blur-sm transition-transform duration-300 ease-silk hover:-translate-y-0.5 sm:left-6 sm:right-auto sm:max-w-sm"
              >
                <div className="min-w-0">
                  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-brass-dark">
                    Pièce maîtresse
                  </p>
                  <p className="mt-1 truncate font-display text-[0.9375rem] text-ink">
                    {hero.product.name}
                  </p>
                  <p className="text-[0.8125rem] tabular text-ink-400">
                    {formatPrice(hero.minPrice, hero.product.currency)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────── Catégories ─────────────────────────────── */

function CategoryGrid() {
  const { data: categories, isLoading } = useCategories();
  const roots = (categories ?? []).filter((c) => !c.parent_id).slice(0, 6);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton aspect-[16/9] rounded" />)}
      </div>
    );
  }
  if (!roots.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {roots.map((c, i) => (
        <Link
          key={c.id}
          to={`/categorie/${c.slug}`}
          className="group relative flex aspect-[16/9] flex-col justify-end overflow-hidden rounded border border-ivory-300 bg-ivory-200 p-5 transition-all duration-500 ease-silk hover:border-brass/50"
        >
          {c.image_url && (
            <img src={c.image_url} alt="" aria-hidden loading="lazy"
                 className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-700 ease-silk group-hover:scale-105" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
          <div className="relative">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-brass">
              {String(i + 1).padStart(2, '0')}
            </p>
            <h3 className="mt-1.5 font-display text-xl text-ivory">{c.name}</h3>
            {c.description && (
              <p className="mt-1 line-clamp-2 max-w-sm text-[0.8125rem] leading-snug text-ivory/70">
                {c.description}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Page ────────────────────────────────── */

export function HomePage() {
  const { data: featured, isLoading } = useFeaturedProducts(8);

  return (
    <>
      <Hero />

      {/* Bandeau défilant : trois promesses, lisibles sans effort */}
      <section className="overflow-hidden border-b border-ivory-300 bg-ivory-200 py-3.5">
        <div className="flex animate-marquee gap-12 whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, dup) => (
            <div key={dup} className="flex shrink-0 gap-12">
              {[
                'Livraison offerte dès 120 €',
                'Retours sous 30 jours',
                'Ateliers européens',
                'Conseil taille par un tailleur',
                'Pièces ressemelables et réparables',
              ].map((t) => (
                <span key={t} className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-400">
                  {t}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Pièces mises en avant */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Sélection</p>
            <h2 className="mt-3 text-display-md font-semibold text-ink">Les pièces maîtresses</h2>
            <p className="mt-2 max-w-lg text-[0.9375rem] text-ink-500">
              Celles par lesquelles on commence : elles donnent la ligne, le reste s'y accorde.
            </p>
          </div>
          <Link to="/boutique" className="link-underline text-[0.8125rem] font-medium text-ink">
            Tout le vestiaire →
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : featured?.length ? (
          <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((item, i) => <ProductCard key={item.product.id} item={item} priority={i < 4} />)}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-ivory-400 px-6 py-16 text-center">
            <p className="font-display text-lg text-ink">Le catalogue est encore vide</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
              Ajoutez vos premiers produits depuis l'administration, puis cochez
              « Pièce maîtresse » pour les faire apparaître ici.
            </p>
            <ButtonLink to="/admin/produits/nouveau" variant="secondary" size="sm" className="mt-6">
              Créer un produit
            </ButtonLink>
          </div>
        )}
      </section>

      {/* Catégories */}
      <section className="border-y border-ivory-300 bg-ivory-200/60 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10">
            <p className="eyebrow">Le vestiaire</p>
            <h2 className="mt-3 text-display-md font-semibold text-ink">Par famille de pièces</h2>
          </div>
          <CategoryGrid />
        </div>
      </section>

      {/* Manifeste */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="eyebrow">La maison</p>
            <h2 className="mt-3 text-display-md font-semibold text-balance text-ink">
              La Sape n'est pas un costume. C'est une tenue.
            </h2>
          </div>
          <div className="lg:col-span-7">
            <div className="prose-sappe max-w-xl text-[0.9375rem]">
              <p>
                Se saper, c'est décider de la manière dont on se présente au monde —
                avec soin, sans excès de moyens. Cette exigence n'a jamais eu besoin
                de budget : elle demande de l'attention.
              </p>
              <p>
                Nous choisissons donc des pièces qui le permettent. Une laine qui garde
                le pli. Une popeline qui tient le col. Un derby qu'on ressemelle au lieu
                de remplacer. Ce sont des vêtements qui vieillissent bien, parce que
                c'est la seule manière de s'habiller qui reste accessible dans le temps.
              </p>
            </div>

            <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {[
                { icon: Scissors, title: 'La coupe d\'abord', text: 'Un vêtement mal coupé ne se sauve pas par la matière. Nos patronages sont ajustés taille par taille.' },
                { icon: ShieldCheck, title: 'Des matières qui durent', text: 'Laine vierge, coton peigné, cuir pleine fleur. Composition détaillée sur chaque fiche.' },
                { icon: RotateCcw, title: 'Retours sous 30 jours', text: 'Essayez chez vous. Si la taille ne va pas, le retour est simple et sans justification.' },
                { icon: Package, title: 'Livraison offerte dès 120 €', text: 'Expédition sous 24 h ouvrées depuis la France, suivi fourni.' },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3.5">
                  <Icon className="mt-0.5 h-[1.1rem] w-[1.1rem] shrink-0 text-brass-dark" aria-hidden />
                  <div>
                    <p className="text-[0.875rem] font-semibold text-ink">{title}</p>
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-500">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
