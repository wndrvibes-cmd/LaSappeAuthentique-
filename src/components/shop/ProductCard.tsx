import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { CatalogItem } from '@/hooks/useShop';
import { productImageUrl } from '@/lib/supabase';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';

/**
 * Carte produit.
 * Le second visuel apparaît au survol — convention du prêt-à-porter haut
 * de gamme : on montre la pièce portée sans quitter la grille.
 */
export function ProductCard({ item, priority = false }: { item: CatalogItem; priority?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { product } = item;
  const primary = productImageUrl(item.imagePath);
  const secondary = productImageUrl(item.secondImagePath);
  const onSale = item.compareAtPrice !== null && item.compareAtPrice > item.maxPrice;
  const discount = onSale
    ? Math.round(((item.compareAtPrice! - item.maxPrice) / item.compareAtPrice!) * 100)
    : 0;
  const soldOut = item.available <= 0;
  const lowStock = !soldOut && item.available <= 3;

  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group"
    >
      <Link to={`/produit/${product.slug}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded bg-ivory-200">
          {primary ? (
            <>
              <img
                src={primary}
                alt={product.name}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-silk',
                  hovered && secondary ? 'scale-105 opacity-0' : 'scale-100 opacity-100',
                )}
              />
              {secondary && (
                <img
                  src={secondary}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  decoding="async"
                  className={cn(
                    'absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-silk',
                    hovered ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
                  )}
                />
              )}
            </>
          ) : (
            /* Aucun visuel en base : on l'indique franchement plutôt que
               d'afficher une image d'emprunt. */
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-ivory-200 px-4 text-center">
              <span className="font-display text-2xl text-ink-300">{product.name.charAt(0)}</span>
              <span className="text-[0.6875rem] uppercase tracking-wider text-ink-300">
                Visuel à venir
              </span>
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {soldOut && <Badge tone="neutral">Épuisé</Badge>}
            {!soldOut && onSale && <Badge tone="danger">− {discount} %</Badge>}
            {lowStock && <Badge tone="warning">Dernières pièces</Badge>}
            {product.is_featured && !soldOut && !onSale && !lowStock && (
              <Badge tone="brass">Pièce maîtresse</Badge>
            )}
          </div>

          {item.colors.length > 1 && (
            <div className="absolute bottom-3 left-3 flex gap-1.5">
              {item.colors.slice(0, 5).map((c) => (
                <span
                  key={c.value}
                  title={c.value}
                  className="h-3.5 w-3.5 rounded-full ring-1 ring-ink/15"
                  style={{ backgroundColor: c.hex ?? '#D6CAB6' }}
                />
              ))}
              {item.colors.length > 5 && (
                <span className="text-[0.625rem] font-medium text-ink-500">
                  +{item.colors.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-3.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-[0.9375rem] leading-snug text-ink">{product.name}</h3>
            <div className="shrink-0 text-right">
              <p className="text-[0.9375rem] font-medium tabular text-ink">
                {item.minPrice === item.maxPrice
                  ? formatPrice(item.minPrice, product.currency)
                  : `dès ${formatPrice(item.minPrice, product.currency)}`}
              </p>
              {onSale && (
                <p className="text-xs tabular text-ink-300 line-through">
                  {formatPrice(item.compareAtPrice!, product.currency)}
                </p>
              )}
            </div>
          </div>

          {product.subtitle && (
            <p className="mt-0.5 text-[0.8125rem] text-ink-400">{product.subtitle}</p>
          )}

          <div className="mt-1.5 flex items-center gap-3">
            {item.averageRating !== null && (
              <span className="flex items-center gap-1 text-xs text-ink-400">
                <Star className="h-3 w-3 fill-brass text-brass" aria-hidden />
                <span className="tabular">{item.averageRating.toFixed(1)}</span>
                <span className="text-ink-300">({item.reviewCount})</span>
              </span>
            )}
            {item.sizes.length > 0 && (
              <span className="text-xs text-ink-300">
                {item.sizes.length > 1 ? `${item.sizes[0]} – ${item.sizes[item.sizes.length - 1]}` : item.sizes[0]}
              </span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[3/4] rounded" />
      <div className="mt-3.5 space-y-2">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-3 w-1/2" />
      </div>
    </div>
  );
}
