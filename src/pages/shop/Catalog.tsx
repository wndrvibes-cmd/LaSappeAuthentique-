import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { useCatalog, useCategories, type CatalogFilters } from '@/hooks/useShop';
import { ProductCard, ProductCardSkeleton } from '@/components/shop/ProductCard';
import { Badge, Button, Checkbox, EmptyState, ErrorBlock, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Panneau de filtres — partagé entre la colonne latérale et le tiroir mobile. */
function FilterPanel({
  filters, setFilters, allSizes, allColors, onClose,
}: {
  filters: CatalogFilters;
  setFilters: (f: CatalogFilters) => void;
  allSizes: string[];
  allColors: { value: string; hex: string | null }[];
  onClose?: () => void;
}) {
  const toggle = (key: 'sizes' | 'colors', value: string) => {
    const current = filters[key] ?? [];
    setFilters({
      ...filters,
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  };

  return (
    <div className="space-y-7">
      {onClose && (
        <div className="flex items-center justify-between">
          <p className="font-display text-lg text-ink">Filtrer</p>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded p-1.5 text-ink-400">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}

      <fieldset>
        <legend className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
          Prix
        </legend>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={0} placeholder="min" aria-label="Prix minimum"
            value={filters.minPrice ?? ''}
            onChange={(e) => setFilters({ ...filters, minPrice: e.target.value ? Number(e.target.value) : null })}
          />
          <span className="text-ink-300">—</span>
          <Input
            type="number" min={0} placeholder="max" aria-label="Prix maximum"
            value={filters.maxPrice ?? ''}
            onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </fieldset>

      {allSizes.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Taille
          </legend>
          <div className="flex flex-wrap gap-2">
            {allSizes.map((size) => {
              const active = filters.sizes?.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggle('sizes', size)}
                  aria-pressed={active}
                  className={cn(
                    'min-w-[2.75rem] rounded border px-2.5 py-1.5 text-[0.8125rem] font-medium transition-all duration-200',
                    active
                      ? 'border-ink bg-ink text-ivory'
                      : 'border-ivory-400 text-ink-600 hover:border-ink/40',
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {allColors.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Couleur
          </legend>
          <div className="space-y-2">
            {allColors.map((c) => (
              <label key={c.value} className="flex cursor-pointer items-center gap-2.5 text-[0.8125rem] text-ink-600">
                <input
                  type="checkbox"
                  checked={filters.colors?.includes(c.value) ?? false}
                  onChange={() => toggle('colors', c.value)}
                  className="h-4 w-4 rounded-xs border-ivory-400 accent-ink"
                />
                <span className="h-3.5 w-3.5 rounded-full ring-1 ring-ink/15"
                      style={{ backgroundColor: c.hex ?? '#D6CAB6' }} />
                {c.value}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-2.5 border-t border-ivory-300 pt-6">
        <Checkbox
          label="Uniquement en stock"
          checked={filters.inStockOnly ?? false}
          onChange={(e) => setFilters({ ...filters, inStockOnly: e.target.checked })}
        />
        <Checkbox
          label="Uniquement les pièces en promotion"
          checked={filters.onSaleOnly ?? false}
          onChange={(e) => setFilters({ ...filters, onSaleOnly: e.target.checked })}
        />
      </fieldset>
    </div>
  );
}

export function CatalogPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const { data: categories } = useCategories();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [filters, setFilters] = useState<CatalogFilters>({
    categorySlug: slug ?? null,
    search: searchParams.get('q') ?? '',
    sort: 'featured',
  });

  // La catégorie vient de l'URL : on garde les deux synchronisés
  const effectiveFilters = useMemo(
    () => ({ ...filters, categorySlug: slug ?? null }),
    [filters, slug],
  );

  const { data: items, isLoading, error, refetch } = useCatalog(effectiveFilters);
  const category = (categories ?? []).find((c) => c.slug === slug);

  // Les options de filtre proviennent du catalogue réellement chargé
  const { allSizes, allColors } = useMemo(() => {
    const sizes = new Set<string>();
    const colors = new Map<string, string | null>();
    for (const item of items ?? []) {
      item.sizes.forEach((s) => sizes.add(s));
      item.colors.forEach((c) => { if (!colors.has(c.value)) colors.set(c.value, c.hex); });
    }
    const numeric = (a: string, b: string) => {
      const na = Number(a); const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
      const ia = order.indexOf(a.toUpperCase()); const ib = order.indexOf(b.toUpperCase());
      if (ia !== -1 && ib !== -1) return ia - ib;
      return a.localeCompare(b, 'fr');
    };
    return {
      allSizes: [...sizes].sort(numeric),
      allColors: [...colors.entries()].map(([value, hex]) => ({ value, hex }))
        .sort((a, b) => a.value.localeCompare(b.value, 'fr')),
    };
  }, [items]);

  const activeCount =
    (filters.sizes?.length ?? 0) + (filters.colors?.length ?? 0) +
    (filters.minPrice != null ? 1 : 0) + (filters.maxPrice != null ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0) + (filters.onSaleOnly ? 1 : 0);

  const reset = () => setFilters({ categorySlug: slug ?? null, search: filters.search, sort: filters.sort });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-10">
        <p className="eyebrow">{category ? 'Catégorie' : 'Catalogue'}</p>
        <h1 className="mt-3 text-display-md font-semibold text-ink">
          {category?.name ?? 'Tout le vestiaire'}
        </h1>
        {category?.description && (
          <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink-500">
            {category.description}
          </p>
        )}
      </header>

      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <FilterPanel
              filters={filters} setFilters={setFilters}
              allSizes={allSizes} allColors={allColors}
            />
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" className="mt-6" onClick={reset}>
                Effacer les filtres ({activeCount})
              </Button>
            )}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.8125rem] text-ink-400">
              {isLoading ? 'Chargement…'
                : `${items?.length ?? 0} ${(items?.length ?? 0) > 1 ? 'pièces' : 'pièce'}`}
            </p>
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary" size="sm" className="lg:hidden"
                icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                onClick={() => setDrawerOpen(true)}
              >
                Filtrer {activeCount > 0 && <Badge tone="brass">{activeCount}</Badge>}
              </Button>
              <Select
                aria-label="Trier"
                className="h-8 w-auto text-[0.8125rem]"
                value={filters.sort ?? 'featured'}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value as CatalogFilters['sort'] })}
              >
                <option value="featured">Mise en avant</option>
                <option value="newest">Nouveautés</option>
                <option value="price_asc">Prix croissant</option>
                <option value="price_desc">Prix décroissant</option>
                <option value="name">Ordre alphabétique</option>
              </Select>
            </div>
          </div>

          {error ? (
            <ErrorBlock
              title="Le catalogue n'a pas pu être chargé"
              message={error instanceof Error ? error.message : null}
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : items?.length ? (
            <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item, i) => (
                <ProductCard key={item.product.id} item={item} priority={i < 3} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucune pièce ne correspond"
              description={
                activeCount > 0
                  ? 'Essayez d’élargir vos critères : les filtres actifs sont peut-être trop restrictifs.'
                  : 'Cette catégorie ne contient pas encore de pièce en ligne.'
              }
              action={activeCount > 0 ? <Button variant="secondary" onClick={reset}>Effacer les filtres</Button> : undefined}
            />
          )}
        </div>
      </div>

      {/* Tiroir de filtres mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Fermer"
            className="absolute inset-0 animate-fade-in bg-ink/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] animate-fade-up overflow-y-auto rounded-t-xl bg-ivory px-5 py-5 safe-bottom">
            <FilterPanel
              filters={filters} setFilters={setFilters}
              allSizes={allSizes} allColors={allColors}
              onClose={() => setDrawerOpen(false)}
            />
            <div className="mt-7 flex gap-3">
              {activeCount > 0 && (
                <Button variant="secondary" fullWidth onClick={reset}>Effacer</Button>
              )}
              <Button fullWidth onClick={() => setDrawerOpen(false)}>
                Voir {items?.length ?? 0} pièce(s)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
