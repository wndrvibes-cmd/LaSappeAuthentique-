import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Heart, Minus, Package, Plus, RotateCcw, Ruler, Star, Truck } from 'lucide-react';
import { useProduct, useShopSettings } from '@/hooks/useShop';
import { useCart } from '@/store/cart';
import { useAuth } from '@/hooks/useAuth';
import { productImageUrl, supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/format';
import { Badge, Button, EmptyState, Field, Input, LoadingBlock, Notice, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

/* ─────────────────────── Sélecteur de variante ────────────────────────
   Les options viennent de la base (Taille, Couleur, ou toute autre option
   définie sur le produit). Une combinaison sans variante existante est
   désactivée : on n'autorise jamais l'ajout de l'inexistant. */

function useVariantSelection(detail: ReturnType<typeof useProduct>['data']) {
  const [selection, setSelection] = useState<Record<string, string>>({});

  // Présélection : la première combinaison réellement disponible
  useEffect(() => {
    if (!detail?.options.length || !detail.variants.length) return;
    const firstAvailable = detail.variants.find((v) => v.available > 0) ?? detail.variants[0];
    const next: Record<string, string> = {};
    for (const option of detail.options) {
      const match = option.values.find((val) => firstAvailable.optionValueIds.includes(val.id));
      if (match) next[option.id] = match.id;
    }
    setSelection(next);
  }, [detail]);

  const selectedVariant = useMemo(() => {
    if (!detail) return null;
    const chosen = Object.values(selection);
    if (chosen.length !== detail.options.length) return null;
    return detail.variants.find((v) => chosen.every((id) => v.optionValueIds.includes(id))) ?? null;
  }, [detail, selection]);

  /** Une valeur est proposable s'il existe une variante en stock la contenant,
      compatible avec les autres choix déjà faits. */
  const isValueAvailable = (optionId: string, valueId: string): boolean => {
    if (!detail) return false;
    const others = Object.entries(selection).filter(([oid]) => oid !== optionId).map(([, vid]) => vid);
    return detail.variants.some(
      (v) => v.optionValueIds.includes(valueId) &&
             others.every((id) => v.optionValueIds.includes(id)) &&
             v.available > 0,
    );
  };

  return { selection, setSelection, selectedVariant, isValueAvailable };
}

/* ────────────────────────────── Galerie ──────────────────────────────── */

function Gallery({ images, productName }: {
  images: { id: string; storage_path: string; alt: string | null }[];
  productName: string;
}) {
  const [active, setActive] = useState(0);
  if (!images.length) {
    return (
      <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-lg bg-ivory-200 px-6 text-center">
        <span className="font-display text-4xl text-ink-300">{productName.charAt(0)}</span>
        <p className="text-[0.8125rem] text-ink-400">
          Aucun visuel pour cette pièce. Les photographies s'ajoutent depuis l'administration.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:gap-4">
      <div className="relative aspect-[3/4] flex-1 overflow-hidden rounded-lg bg-ivory-200">
        <img
          key={images[active].id}
          src={productImageUrl(images[active].storage_path) ?? ''}
          alt={images[active].alt ?? productName}
          className="h-full w-full animate-fade-in object-cover"
          loading="eager" decoding="async"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto lg:w-20 lg:flex-col lg:overflow-visible">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Visuel ${i + 1}`}
              aria-current={i === active}
              className={cn(
                'relative h-20 w-16 shrink-0 overflow-hidden rounded border-2 transition-colors lg:h-24 lg:w-full',
                i === active ? 'border-ink' : 'border-transparent hover:border-ivory-400',
              )}
            >
              <img src={productImageUrl(img.storage_path) ?? ''} alt="" aria-hidden
                   className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── Avis clients ───────────────────────────── */

function ReviewForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const { user, profile } = useAuth();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Connexion requise');
      const { error: err } = await supabase.from('product_reviews').insert({
        product_id: productId,
        profile_id: user.id,
        author_name: profile?.full_name || 'Client',
        rating, title: title || null, body: body || null,
        is_published: false,
      });
      if (err) throw err;
    },
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : 'Envoi impossible'),
  });

  if (!user) {
    return (
      <Notice tone="info">
        <Link to="/connexion" className="link-underline font-medium">Connectez-vous</Link>
        {' '}pour laisser un avis sur cette pièce.
      </Notice>
    );
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-ivory-300 bg-ivory-200/40 p-5"
      onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate(); }}
    >
      <Field label="Votre note" required>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)}
                    aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>
              <Star className={cn('h-6 w-6 transition-colors',
                n <= rating ? 'fill-brass text-brass' : 'text-ivory-400')} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Titre">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
               placeholder="Ex. : taille parfaitement, belle matière" />
      </Field>
      <Field label="Votre avis" hint="Parlez de la taille, de la matière et du tombé : c'est ce qui aide le plus.">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={mutation.isPending}>Envoyer mon avis</Button>
        <p className="text-xs text-ink-400">Publié après relecture par la maison.</p>
      </div>
    </form>
  );
}

/* ─────────────────────────────── Page ────────────────────────────────── */

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: detail, isLoading } = useProduct(slug);
  const { data: settings } = useShopSettings();
  const { add, busyVariantId } = useCart();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { selection, setSelection, selectedVariant, isValueAvailable } = useVariantSelection(detail);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);

  useEffect(() => {
    if (!user || !detail) return;
    void supabase.from('wishlist_items')
      .select('product_id').eq('profile_id', user.id).eq('product_id', detail.product.id)
      .maybeSingle().then(({ data }) => setWishlisted(Boolean(data)));
  }, [user, detail]);

  if (isLoading) return <LoadingBlock label="Chargement de la pièce…" />;
  if (!detail) {
    return (
      <EmptyState
        title="Pièce introuvable"
        description="Cette pièce n'existe pas ou n'est plus en ligne."
        action={<Link to="/boutique" className="link-underline text-sm font-medium">Retour au vestiaire</Link>}
      />
    );
  }

  const { product, category, images, reviews, averageRating, promotion } = detail;
  const price = selectedVariant?.price ?? Number(product.base_price);
  const compareAt = product.compare_at_price !== null ? Number(product.compare_at_price) : null;
  const onSale = compareAt !== null && compareAt > price;
  const available = selectedVariant?.available ?? 0;
  const totalAvailable = detail.variants.reduce((s, v) => s + v.available, 0);
  const freeShippingAbove = settings?.free_shipping_above ?? null;

  // Remise automatique applicable (promotion sans code)
  const promoPrice = promotion
    ? promotion.type === 'percentage'
      ? Math.round(price * (1 - Number(promotion.value) / 100) * 100) / 100
      : promotion.type === 'fixed_amount'
        ? Math.max(price - Number(promotion.value), 0)
        : price
    : null;

  async function handleAdd() {
    if (!selectedVariant) {
      setFeedback({ tone: 'danger', text: 'Choisissez une taille et un coloris.' });
      return;
    }
    const { error } = await add(selectedVariant.id, quantity);
    setFeedback(error
      ? { tone: 'danger', text: error }
      : { tone: 'success', text: 'Ajouté au panier.' });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function toggleWishlist() {
    if (!user) { window.location.href = '/connexion'; return; }
    if (wishlisted) {
      await supabase.from('wishlist_items').delete()
        .eq('profile_id', user.id).eq('product_id', product.id);
      setWishlisted(false);
    } else {
      await supabase.from('wishlist_items').insert({ profile_id: user.id, product_id: product.id });
      setWishlisted(true);
    }
    void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <nav aria-label="Fil d'Ariane" className="mb-8 flex flex-wrap items-center gap-1.5 text-[0.75rem] text-ink-400">
        <Link to="/" className="hover:text-ink">Accueil</Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <Link to="/boutique" className="hover:text-ink">Vestiaire</Link>
        {category && (
          <>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <Link to={`/categorie/${category.slug}`} className="hover:text-ink">{category.name}</Link>
          </>
        )}
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="text-ink-600">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <Gallery images={images} productName={product.name} />

        <div>
          {product.subtitle && <p className="eyebrow">{product.subtitle}</p>}
          <h1 className="mt-3 text-display-md font-semibold text-balance text-ink">{product.name}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl font-medium tabular text-ink">
                {formatPrice(promoPrice ?? price, product.currency)}
              </span>
              {promoPrice !== null && promoPrice < price && (
                <span className="text-base tabular text-ink-300 line-through">
                  {formatPrice(price, product.currency)}
                </span>
              )}
              {promoPrice === null && onSale && (
                <span className="text-base tabular text-ink-300 line-through">
                  {formatPrice(compareAt!, product.currency)}
                </span>
              )}
            </div>
            {promotion && <Badge tone="danger">{promotion.title}</Badge>}
            {averageRating !== null && (
              <a href="#avis" className="flex items-center gap-1.5 text-[0.8125rem] text-ink-500">
                <span className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn('h-3.5 w-3.5',
                      n <= Math.round(averageRating) ? 'fill-brass text-brass' : 'text-ivory-400')} />
                  ))}
                </span>
                <span className="link-underline">{reviews.length} avis</span>
              </a>
            )}
          </div>

          {settings?.prices_include_vat && (
            <p className="mt-1.5 text-xs text-ink-400">
              TTC, TVA {Math.round(Number(settings.vat_rate) * 100)} % incluse
              {freeShippingAbove ? ` · livraison offerte dès ${formatPrice(Number(freeShippingAbove))}` : ''}
            </p>
          )}

          {product.description && (
            <p className="mt-6 text-[0.9375rem] leading-relaxed text-ink-600">{product.description}</p>
          )}

          {/* Options */}
          <div className="mt-8 space-y-6">
            {detail.options.map((option) => {
              const isColor = option.name.toLowerCase() === 'couleur';
              return (
                <fieldset key={option.id}>
                  <legend className="mb-3 flex items-baseline justify-between gap-3 text-[0.8125rem] font-medium text-ink">
                    <span>{option.name}</span>
                    {selection[option.id] && (
                      <span className="text-ink-400">
                        {option.values.find((v) => v.id === selection[option.id])?.value}
                      </span>
                    )}
                  </legend>
                  <div className={cn('flex flex-wrap', isColor ? 'gap-2.5' : 'gap-2')}>
                    {option.values.map((value) => {
                      const selected = selection[option.id] === value.id;
                      const possible = isValueAvailable(option.id, value.id);
                      return (
                        <button
                          key={value.id}
                          type="button"
                          onClick={() => { setSelection({ ...selection, [option.id]: value.id }); setQuantity(1); }}
                          aria-pressed={selected}
                          title={possible ? value.value : `${value.value} — indisponible`}
                          className={cn(
                            'relative transition-all duration-200 ease-silk',
                            isColor
                              ? 'h-9 w-9 rounded-full ring-1 ring-offset-2 ring-offset-ivory'
                              : 'min-w-[3rem] rounded border px-3 py-2 text-[0.8125rem] font-medium',
                            isColor
                              ? selected ? 'ring-2 ring-ink' : 'ring-ivory-400 hover:ring-ink/40'
                              : selected
                                ? 'border-ink bg-ink text-ivory'
                                : 'border-ivory-400 text-ink-600 hover:border-ink/40',
                            !possible && 'opacity-35',
                          )}
                          style={isColor ? { backgroundColor: value.swatch_hex ?? '#D6CAB6' } : undefined}
                        >
                          {!isColor && value.value}
                          {!possible && !isColor && (
                            <span className="absolute inset-x-1 top-1/2 h-px -rotate-12 bg-current opacity-50" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>

          {/* Disponibilité */}
          <div className="mt-6">
            {totalAvailable <= 0 ? (
              <Notice tone="warning" title="Pièce épuisée">
                Cette pièce est momentanément indisponible dans toutes les tailles.
              </Notice>
            ) : selectedVariant ? (
              available > 5 ? (
                <p className="flex items-center gap-1.5 text-[0.8125rem] text-signal-success">
                  <Check className="h-3.5 w-3.5" aria-hidden /> En stock, expédition sous 24 h ouvrées
                </p>
              ) : available > 0 ? (
                <p className="text-[0.8125rem] font-medium text-signal-warning">
                  Plus que {available} pièce{available > 1 ? 's' : ''} dans cette taille
                </p>
              ) : (
                <p className="text-[0.8125rem] text-signal-danger">
                  Épuisé dans cette combinaison — choisissez une autre taille ou un autre coloris.
                </p>
              )
            ) : (
              <p className="text-[0.8125rem] text-ink-400">Choisissez une taille et un coloris.</p>
            )}
          </div>

          {/* Ajout au panier */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex h-12 items-center rounded border border-ivory-400">
              <button
                type="button" aria-label="Diminuer la quantité"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="px-3.5 text-ink-500 transition-colors hover:text-ink disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="w-8 text-center text-sm font-medium tabular">{quantity}</span>
              <button
                type="button" aria-label="Augmenter la quantité"
                onClick={() => setQuantity((q) => Math.min(available || 1, q + 1))}
                disabled={quantity >= available}
                className="px-3.5 text-ink-500 transition-colors hover:text-ink disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>

            <Button
              size="lg"
              className="flex-1"
              onClick={handleAdd}
              loading={busyVariantId === selectedVariant?.id}
              disabled={!selectedVariant || available <= 0}
            >
              {available <= 0 && selectedVariant ? 'Indisponible' : 'Ajouter au panier'}
            </Button>

            <Button
              size="lg" variant="secondary" onClick={toggleWishlist}
              aria-label={wishlisted ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className="w-12 px-0"
            >
              <Heart className={cn('h-4 w-4', wishlisted && 'fill-bordeaux text-bordeaux')} aria-hidden />
            </Button>
          </div>

          {feedback && (
            <Notice tone={feedback.tone} className="mt-4">{feedback.text}</Notice>
          )}

          {/* Services */}
          <dl className="mt-8 grid gap-4 border-t border-ivory-300 pt-7 sm:grid-cols-2">
            {[
              { icon: Truck, t: 'Livraison', d: freeShippingAbove ? `Offerte dès ${formatPrice(Number(freeShippingAbove))}` : 'Expédition sous 24 h ouvrées' },
              { icon: RotateCcw, t: 'Retours', d: '30 jours, sans justification' },
              { icon: Ruler, t: 'Conseil taille', d: 'Guide détaillé et assistance' },
              { icon: Package, t: 'Emballage', d: 'Housse et cintre fournis' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brass-dark" aria-hidden />
                <div>
                  <dt className="text-[0.8125rem] font-semibold text-ink">{t}</dt>
                  <dd className="text-[0.8125rem] text-ink-500">{d}</dd>
                </div>
              </div>
            ))}
          </dl>

          {/* Détails */}
          <div className="mt-8 divide-y divide-ivory-300 border-t border-ivory-300">
            {[
              ['Matières et composition', product.composition],
              ['Entretien', product.care_guide],
              ["L'histoire de la pièce", product.story],
            ].filter(([, content]) => Boolean(content)).map(([label, content]) => (
              <details key={label as string} className="group py-4">
                <summary className="flex cursor-pointer items-center justify-between text-[0.875rem] font-medium text-ink">
                  {label}
                  <Plus className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-45" aria-hidden />
                </summary>
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-500">{content}</p>
              </details>
            ))}
            {selectedVariant && (
              <div className="py-4 text-[0.75rem] text-ink-400">
                Référence : <span className="font-mono">{selectedVariant.sku}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Avis */}
      <section id="avis" className="mt-20 border-t border-ivory-300 pt-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Retours clients</p>
            <h2 className="mt-3 font-display text-2xl text-ink">
              {reviews.length ? `${reviews.length} avis` : 'Aucun avis pour le moment'}
            </h2>
            {averageRating !== null && (
              <p className="mt-1.5 text-[0.8125rem] text-ink-500">
                Note moyenne de {averageRating.toFixed(1)} sur 5
              </p>
            )}
          </div>
          {!showReviewForm && (
            <Button variant="secondary" size="sm" onClick={() => setShowReviewForm(true)}>
              Laisser un avis
            </Button>
          )}
        </div>

        {showReviewForm && (
          <div className="mb-8">
            <ReviewForm productId={product.id} onDone={() => {
              setShowReviewForm(false);
              setFeedback({ tone: 'success', text: 'Merci : votre avis sera publié après relecture.' });
            }} />
          </div>
        )}

        {reviews.length ? (
          <ul className="grid gap-5 sm:grid-cols-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-lg border border-ivory-300 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={cn('h-3.5 w-3.5',
                          n <= r.rating ? 'fill-brass text-brass' : 'text-ivory-400')} />
                      ))}
                    </div>
                    {r.title && <p className="mt-2 text-[0.875rem] font-semibold text-ink">{r.title}</p>}
                  </div>
                  {r.is_verified && <Badge tone="success">Achat vérifié</Badge>}
                </div>
                {r.body && <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-ink-500">{r.body}</p>}
                <p className="mt-3 text-xs text-ink-300">{r.author_name}</p>
              </li>
            ))}
          </ul>
        ) : !showReviewForm && (
          <p className="text-[0.875rem] text-ink-400">
            Soyez la première personne à donner son avis sur cette pièce.
          </p>
        )}
      </section>
    </div>
  );
}
