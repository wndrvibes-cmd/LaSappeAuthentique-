import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { useCart } from '@/store/cart';
import { useShopSettings } from '@/hooks/useShop';
import { productImageUrl } from '@/lib/supabase';
import { formatPrice } from '@/lib/format';
import { Badge, Button, ButtonLink, EmptyState, Input, LoadingBlock, Notice } from '@/components/ui';

export function CartPage() {
  const navigate = useNavigate();
  const { lines, loading, discount, load, setQuantity, remove, applyDiscount, removeDiscount,
          subtotal, discountAmount, busyVariantId } = useCart();
  const { data: settings } = useShopSettings();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => { void load(); }, [load]);

  const sub = subtotal();
  const disc = discountAmount();
  const freeAbove = settings?.free_shipping_above !== null && settings?.free_shipping_above !== undefined
    ? Number(settings.free_shipping_above) : null;
  const qualifiesFreeShipping = freeAbove !== null && sub - disc >= freeAbove;
  const remainingForFree = freeAbove !== null ? Math.max(freeAbove - (sub - disc), 0) : 0;

  // Les lignes dont le stock est devenu insuffisant doivent être signalées
  const problematic = lines.filter((l) => l.quantity > l.available);

  if (loading && !lines.length) return <LoadingBlock label="Chargement du panier…" />;

  if (!lines.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={<ShoppingBag className="h-10 w-10" />}
          title="Votre panier est vide"
          description="Les pièces que vous ajoutez sont conservées, même si vous revenez plus tard."
          action={<ButtonLink to="/boutique">Découvrir le vestiaire</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-display text-display-md font-semibold text-ink">Votre panier</h1>
      <p className="mt-2 text-[0.875rem] text-ink-400">
        {lines.length} référence{lines.length > 1 ? 's' : ''} ·{' '}
        {lines.reduce((s, l) => s + l.quantity, 0)} article
        {lines.reduce((s, l) => s + l.quantity, 0) > 1 ? 's' : ''}
      </p>

      {problematic.length > 0 && (
        <Notice tone="warning" title="Stock insuffisant" className="mt-6">
          {problematic.map((l) => (
            <p key={l.variantId}>
              {l.productName} ({l.variantTitle}) : {l.available} pièce(s) disponible(s)
              pour {l.quantity} demandée(s). Ajustez la quantité pour continuer.
            </p>
          ))}
        </Notice>
      )}

      <div className="mt-8 lg:grid lg:grid-cols-[1fr_22rem] lg:gap-12">
        <div>
          <ul className="divide-y divide-ivory-300 border-y border-ivory-300">
            {lines.map((line) => {
              const image = productImageUrl(line.imagePath);
              const busy = busyVariantId === line.variantId;
              const overStock = line.quantity > line.available;
              return (
                <li key={line.variantId} className="flex gap-4 py-5">
                  <Link to={`/produit/${line.productSlug}`} className="shrink-0">
                    <div className="h-28 w-[5.25rem] overflow-hidden rounded bg-ivory-200">
                      {image ? (
                        <img src={image} alt={line.productName} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center font-display text-xl text-ink-300">
                          {line.productName.charAt(0)}
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/produit/${line.productSlug}`}
                              className="font-display text-[0.9375rem] text-ink hover:text-brass-dark">
                          {line.productName}
                        </Link>
                        <p className="mt-0.5 text-[0.8125rem] text-ink-400">{line.variantTitle}</p>
                        <p className="mt-0.5 font-mono text-[0.6875rem] text-ink-300">{line.sku}</p>
                        {overStock && <Badge tone="danger" className="mt-1.5">Stock insuffisant</Badge>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[0.9375rem] font-medium tabular text-ink">
                          {formatPrice(line.unitPrice * line.quantity)}
                        </p>
                        {line.quantity > 1 && (
                          <p className="text-xs tabular text-ink-400">
                            {formatPrice(line.unitPrice)} l'unité
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex h-9 items-center rounded border border-ivory-400">
                        <button type="button" aria-label="Diminuer"
                          onClick={() => void setQuantity(line.variantId, line.quantity - 1)}
                          disabled={busy}
                          className="px-3 text-ink-500 hover:text-ink disabled:opacity-30">
                          <Minus className="h-3 w-3" aria-hidden />
                        </button>
                        <span className="w-7 text-center text-[0.8125rem] font-medium tabular">{line.quantity}</span>
                        <button type="button" aria-label="Augmenter"
                          onClick={() => void setQuantity(line.variantId, line.quantity + 1)}
                          disabled={busy || line.quantity >= line.available}
                          className="px-3 text-ink-500 hover:text-ink disabled:opacity-30">
                          <Plus className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                      <button type="button" onClick={() => void remove(line.variantId)} disabled={busy}
                        className="flex items-center gap-1.5 text-[0.75rem] text-ink-400 transition-colors hover:text-signal-danger">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Retirer
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <Link to="/boutique" className="link-underline mt-6 inline-block text-[0.8125rem] font-medium text-ink">
            ← Continuer mes achats
          </Link>
        </div>

        {/* Récapitulatif */}
        <aside className="mt-10 lg:mt-0">
          <div className="sticky top-28 rounded-lg border border-ivory-300 bg-white p-5 shadow-card">
            <h2 className="font-display text-base text-ink">Récapitulatif</h2>

            <form
              className="mt-5"
              onSubmit={async (e) => {
                e.preventDefault();
                setCodeError(null);
                setApplying(true);
                const { error } = await applyDiscount(code);
                setApplying(false);
                if (error) setCodeError(error);
                else setCode('');
              }}
            >
              {discount?.valid ? (
                <div className="flex items-center justify-between rounded border border-signal-success/25 bg-sage-soft px-3 py-2.5">
                  <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-signal-success">
                    <Tag className="h-3.5 w-3.5" aria-hidden />
                    {discount.code}
                  </span>
                  <button type="button" onClick={removeDiscount} aria-label="Retirer le code"
                          className="text-ink-400 hover:text-ink">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Code de réduction" value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      aria-label="Code de réduction"
                    />
                    <Button type="submit" variant="secondary" loading={applying} disabled={!code.trim()}>
                      Appliquer
                    </Button>
                  </div>
                  {codeError && <p className="mt-2 text-xs text-signal-danger">{codeError}</p>}
                </>
              )}
            </form>

            <dl className="mt-6 space-y-2.5 border-t border-ivory-300 pt-5 text-[0.875rem]">
              <div className="flex justify-between">
                <dt className="text-ink-500">Sous-total</dt>
                <dd className="tabular text-ink">{formatPrice(sub)}</dd>
              </div>
              {disc > 0 && (
                <div className="flex justify-between text-signal-success">
                  <dt>Réduction {discount?.code ? `(${discount.code})` : ''}</dt>
                  <dd className="tabular">− {formatPrice(disc)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-500">Livraison</dt>
                <dd className="tabular text-ink-400">
                  {qualifiesFreeShipping || discount?.free_shipping
                    ? <span className="text-signal-success">Offerte</span>
                    : 'calculée au paiement'}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ivory-300 pt-3 text-base font-medium">
                <dt className="text-ink">Total</dt>
                <dd className="tabular text-ink">{formatPrice(sub - disc)}</dd>
              </div>
            </dl>

            {!qualifiesFreeShipping && freeAbove !== null && remainingForFree > 0 && (
              <div className="mt-4 rounded bg-brass-soft px-3 py-2.5">
                <p className="text-[0.75rem] text-ink-600">
                  Plus que <strong className="tabular">{formatPrice(remainingForFree)}</strong>{' '}
                  pour la livraison offerte.
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-ivory-300">
                  <div
                    className="h-full rounded-full bg-brass transition-all duration-500 ease-silk"
                    style={{ width: `${Math.min(((sub - disc) / freeAbove) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              size="lg" fullWidth className="mt-6"
              disabled={problematic.length > 0}
              onClick={() => navigate('/commande')}
            >
              Passer au paiement
            </Button>

            {problematic.length > 0 && (
              <p className="mt-2 text-center text-xs text-signal-danger">
                Ajustez les quantités signalées pour continuer.
              </p>
            )}

            <p className="mt-4 text-center text-[0.6875rem] leading-relaxed text-ink-400">
              Paiement sécurisé · Retours sous 30 jours
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
