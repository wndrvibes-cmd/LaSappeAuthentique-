/**
 * Accès aux données de la boutique.
 * Toutes les requêtes passent par Supabase sous RLS : aucune donnée n'est
 * fabriquée côté client.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  CatalogProduct, CatalogVariant, Category, InventoryHealth, Order, OrderItem, ProductImage, ProductOption,
  ProductOptionValue, ProductReview, Promotion, ShippingMethod,
  ShopPublicSettings, VariantAvailability,
} from '@/types/database';

/* ───────────────────────── Paramètres boutique ────────────────────────── */

/**
 * Paramètres publics de la boutique.
 *
 * Lecture de la vue `shop_public_settings` et non de la table : les objectifs
 * économiques (marge cible, coût d'acquisition visé, charges fixes) ne sont
 * pas publiables. Le back-office lit la table complète via `useAdminSettings`.
 */
export function useShopSettings() {
  return useQuery({
    queryKey: ['shop-settings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ShopPublicSettings | null> => {
      const { data, error } = await supabase
        .from('shop_public_settings').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/* ───────────────────────────── Catégories ─────────────────────────────── */

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories').select('*').eq('is_visible', true).order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ──────────────────────── Catalogue (liste) ───────────────────────────── */

export interface CatalogFilters {
  categorySlug?: string | null;
  search?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  sizes?: string[];
  colors?: string[];
  inStockOnly?: boolean;
  onSaleOnly?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name' | 'featured';
}

export interface CatalogItem {
  product: CatalogProduct;
  minPrice: number;
  maxPrice: number;
  compareAtPrice: number | null;
  imagePath: string | null;
  secondImagePath: string | null;
  available: number;
  sizes: string[];
  colors: { value: string; hex: string | null }[];
  averageRating: number | null;
  reviewCount: number;
}

export function useCatalog(filters: CatalogFilters = {}) {
  return useQuery({
    queryKey: ['catalog', filters],
    queryFn: async (): Promise<CatalogItem[]> => {
      let query = supabase.from('catalog_products').select('*');

      if (filters.categorySlug) {
        const { data: cat } = await supabase
          .from('categories').select('id').eq('slug', filters.categorySlug).maybeSingle();
        if (!cat) return [];
        query = query.eq('category_id', cat.id);
      }
      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`;
        query = query.or(`name.ilike.${term},subtitle.ilike.${term},description.ilike.${term}`);
      }

      switch (filters.sort) {
        case 'price_asc': query = query.order('base_price', { ascending: true }); break;
        case 'price_desc': query = query.order('base_price', { ascending: false }); break;
        case 'name': query = query.order('name'); break;
        case 'featured': query = query.order('is_featured', { ascending: false })
                                      .order('published_at', { ascending: false }); break;
        default: query = query.order('published_at', { ascending: false, nullsFirst: false });
      }

      const { data: products, error } = await query;
      if (error) throw error;
      if (!products?.length) return [];

      const ids = products.map((p) => p.id);
      const [variants, images, availability, options, optionValues, reviews] = await Promise.all([
        supabase.from('catalog_variants').select('*').in('product_id', ids),
        supabase.from('product_images').select('*').in('product_id', ids).order('position'),
        supabase.from('variant_availability').select('*').in('product_id', ids),
        supabase.from('product_options').select('*').in('product_id', ids),
        supabase.from('product_option_values').select('*'),
        supabase.from('product_reviews').select('product_id, rating')
          .in('product_id', ids).eq('is_published', true),
      ]);

      const variantsBy = groupBy(variants.data ?? [], (v) => v.product_id);
      const imagesBy = groupBy(images.data ?? [], (i) => i.product_id);
      const optionsBy = groupBy(options.data ?? [], (o) => o.product_id);
      const valuesByOption = groupBy(optionValues.data ?? [], (v) => v.option_id);
      const availBy = new Map((availability.data ?? []).map((a) => [a.variant_id, a]));
      const reviewsBy = groupBy(reviews.data ?? [], (r) => r.product_id);

      const items: CatalogItem[] = products.map((product) => {
        const vs = variantsBy.get(product.id) ?? [];
        const prices = vs.map((v) => Number(v.price ?? product.base_price));
        const effective = prices.length ? prices : [Number(product.base_price)];
        const available = vs.reduce((s, v) => s + (availBy.get(v.id)?.available ?? 0), 0);

        const opts = optionsBy.get(product.id) ?? [];
        const sizeOption = opts.find((o) => o.name.toLowerCase() === 'taille');
        const colorOption = opts.find((o) => o.name.toLowerCase() === 'couleur');
        const sizes = sizeOption
          ? (valuesByOption.get(sizeOption.id) ?? []).sort((a, b) => a.position - b.position).map((v) => v.value)
          : [];
        const colors = colorOption
          ? (valuesByOption.get(colorOption.id) ?? []).sort((a, b) => a.position - b.position)
              .map((v) => ({ value: v.value, hex: v.swatch_hex }))
          : [];

        const prodReviews = reviewsBy.get(product.id) ?? [];
        const imgs = imagesBy.get(product.id) ?? [];

        return {
          product,
          minPrice: Math.min(...effective),
          maxPrice: Math.max(...effective),
          compareAtPrice: product.compare_at_price !== null ? Number(product.compare_at_price) : null,
          imagePath: imgs[0]?.storage_path ?? null,
          secondImagePath: imgs[1]?.storage_path ?? null,
          available,
          sizes, colors,
          averageRating: prodReviews.length
            ? Math.round((prodReviews.reduce((s, r) => s + r.rating, 0) / prodReviews.length) * 10) / 10
            : null,
          reviewCount: prodReviews.length,
        };
      });

      // Filtres appliqués après assemblage (ils portent sur des données dérivées)
      return items.filter((item) => {
        if (filters.inStockOnly && item.available <= 0) return false;
        if (filters.onSaleOnly && !(item.compareAtPrice && item.compareAtPrice > item.maxPrice)) return false;
        if (filters.minPrice != null && item.maxPrice < filters.minPrice) return false;
        if (filters.maxPrice != null && item.minPrice > filters.maxPrice) return false;
        if (filters.sizes?.length && !filters.sizes.some((s) => item.sizes.includes(s))) return false;
        if (filters.colors?.length && !filters.colors.some((c) => item.colors.some((ic) => ic.value === c))) return false;
        return true;
      });
    },
  });
}

/* ─────────────────────── Fiche produit détaillée ──────────────────────── */

export interface ProductDetail {
  product: CatalogProduct;
  category: Category | null;
  variants: (CatalogVariant & { available: number; optionValueIds: string[] })[];
  options: (ProductOption & { values: ProductOptionValue[] })[];
  images: ProductImage[];
  reviews: ProductReview[];
  averageRating: number | null;
  promotion: Promotion | null;
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ['product', slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<ProductDetail | null> => {
      const { data: product, error } = await supabase
        .from('catalog_products').select('*').eq('slug', slug!).maybeSingle();
      if (error) throw error;
      if (!product) return null;

      const [cat, variants, options, images, reviews, promos] = await Promise.all([
        product.category_id
          ? supabase.from('categories').select('*').eq('id', product.category_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('catalog_variants').select('*')
          .eq('product_id', product.id).order('position'),
        supabase.from('product_options').select('*').eq('product_id', product.id).order('position'),
        supabase.from('product_images').select('*').eq('product_id', product.id).order('position'),
        supabase.from('product_reviews').select('*')
          .eq('product_id', product.id).eq('is_published', true)
          .order('created_at', { ascending: false }),
        supabase.from('promotions').select('*').eq('is_active', true),
      ]);

      const variantIds = (variants.data ?? []).map((v) => v.id);
      const [availability, links, optionValues] = await Promise.all([
        supabase.from('variant_availability').select('*').in('variant_id', variantIds),
        supabase.from('variant_option_values').select('*').in('variant_id', variantIds),
        supabase.from('product_option_values').select('*')
          .in('option_id', (options.data ?? []).map((o) => o.id)).order('position'),
      ]);

      const availBy = new Map((availability.data ?? []).map((a: VariantAvailability) => [a.variant_id, a.available]));
      const linksBy = groupBy(links.data ?? [], (l) => l.variant_id);
      const valuesBy = groupBy(optionValues.data ?? [], (v) => v.option_id);

      const reviewList = reviews.data ?? [];

      // Promotion applicable : sur le produit, sinon sur sa catégorie
      const now = Date.now();
      const promotion = (promos.data ?? []).find((p) =>
        (p.product_id === product.id || (p.category_id && p.category_id === product.category_id)) &&
        new Date(p.starts_at).getTime() <= now &&
        (!p.ends_at || new Date(p.ends_at).getTime() > now)) ?? null;

      return {
        product,
        category: cat.data ?? null,
        variants: (variants.data ?? []).map((v) => ({
          ...v,
          price: Number(v.price ?? product.base_price),
          available: availBy.get(v.id) ?? 0,
          optionValueIds: (linksBy.get(v.id) ?? []).map((l) => l.option_value_id),
        })),
        options: (options.data ?? []).map((o) => ({ ...o, values: valuesBy.get(o.id) ?? [] })),
        images: images.data ?? [],
        reviews: reviewList,
        averageRating: reviewList.length
          ? Math.round((reviewList.reduce((s, r) => s + r.rating, 0) / reviewList.length) * 10) / 10
          : null,
        promotion,
      };
    },
  });
}

/* ─────────────────────── Produits mis en avant ───────────────────────── */

export function useFeaturedProducts(limit = 8) {
  return useQuery({
    queryKey: ['featured', limit],
    staleTime: 60_000,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data: products } = await supabase
        .from('catalog_products').select('*').eq('is_featured', true)
        .order('published_at', { ascending: false, nullsFirst: false }).limit(limit);
      if (!products?.length) return [];

      const ids = products.map((p) => p.id);
      const [variants, images, availability] = await Promise.all([
        supabase.from('catalog_variants').select('id, product_id, price').in('product_id', ids),
        supabase.from('product_images').select('product_id, storage_path, position')
          .in('product_id', ids).order('position'),
        supabase.from('variant_availability').select('variant_id, product_id, available').in('product_id', ids),
      ]);

      const variantsBy = groupBy(variants.data ?? [], (v) => v.product_id);
      const imagesBy = groupBy(images.data ?? [], (i) => i.product_id);
      const availBy = new Map((availability.data ?? []).map((a) => [a.variant_id, a.available]));

      return products.map((product) => {
        const vs = variantsBy.get(product.id) ?? [];
        const prices = vs.map((v) => Number(v.price ?? product.base_price));
        const effective = prices.length ? prices : [Number(product.base_price)];
        const imgs = imagesBy.get(product.id) ?? [];
        return {
          product,
          minPrice: Math.min(...effective),
          maxPrice: Math.max(...effective),
          compareAtPrice: product.compare_at_price !== null ? Number(product.compare_at_price) : null,
          imagePath: imgs[0]?.storage_path ?? null,
          secondImagePath: imgs[1]?.storage_path ?? null,
          available: vs.reduce((s, v) => s + (availBy.get(v.id) ?? 0), 0),
          sizes: [], colors: [], averageRating: null, reviewCount: 0,
        };
      });
    },
  });
}

/* ─────────────────────────── Livraison ───────────────────────────────── */

export function useShippingMethods(countryCode = 'FR') {
  return useQuery({
    queryKey: ['shipping-methods', countryCode],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ShippingMethod[]> => {
      const { data: zones } = await supabase
        .from('shipping_zones').select('id, country_codes').eq('is_active', true);
      const zoneIds = (zones ?? [])
        .filter((z) => z.country_codes.includes(countryCode)).map((z) => z.id);
      if (!zoneIds.length) return [];
      const { data } = await supabase.from('shipping_methods').select('*')
        .in('zone_id', zoneIds).eq('is_active', true).order('position');
      return data ?? [];
    },
  });
}

/* ───────────────────────── Commandes du client ───────────────────────── */

export function useMyOrders(profileId: string | undefined) {
  return useQuery({
    queryKey: ['my-orders', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<(Order & { items: OrderItem[] })[]> => {
      const { data: orders, error } = await supabase
        .from('orders').select('*').eq('profile_id', profileId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!orders?.length) return [];
      const { data: items } = await supabase
        .from('order_items').select('*').in('order_id', orders.map((o) => o.id));
      const itemsBy = groupBy(items ?? [], (i) => i.order_id);
      return orders.map((o) => ({ ...o, items: itemsBy.get(o.id) ?? [] }));
    },
  });
}

/* ───────────────────────────── Favoris ──────────────────────────────── */

export function useWishlist(profileId: string | undefined) {
  return useQuery({
    queryKey: ['wishlist', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data: rows } = await supabase
        .from('wishlist_items').select('product_id').eq('profile_id', profileId!);
      const ids = (rows ?? []).map((r) => r.product_id);
      if (!ids.length) return [];

      const { data: products } = await supabase
        .from('catalog_products').select('*').in('id', ids);
      if (!products?.length) return [];

      const [images, variants, availability] = await Promise.all([
        supabase.from('product_images').select('product_id, storage_path, position')
          .in('product_id', ids).order('position'),
        supabase.from('catalog_variants').select('id, product_id, price').in('product_id', ids),
        supabase.from('variant_availability').select('variant_id, product_id, available').in('product_id', ids),
      ]);
      const imagesBy = groupBy(images.data ?? [], (i) => i.product_id);
      const variantsBy = groupBy(variants.data ?? [], (v) => v.product_id);
      const availBy = new Map((availability.data ?? []).map((a) => [a.variant_id, a.available]));

      return products.map((product) => {
        const vs = variantsBy.get(product.id) ?? [];
        const prices = vs.map((v) => Number(v.price ?? product.base_price));
        const effective = prices.length ? prices : [Number(product.base_price)];
        return {
          product,
          minPrice: Math.min(...effective), maxPrice: Math.max(...effective),
          compareAtPrice: product.compare_at_price !== null ? Number(product.compare_at_price) : null,
          imagePath: (imagesBy.get(product.id) ?? [])[0]?.storage_path ?? null,
          secondImagePath: null,
          available: vs.reduce((s, v) => s + (availBy.get(v.id) ?? 0), 0),
          sizes: [], colors: [], averageRating: null, reviewCount: 0,
        };
      });
    },
  });
}

/* ─────────────────────── Bannière promotionnelle ─────────────────────── */

export function useActivePromotions() {
  return useQuery({
    queryKey: ['promotions-active'],
    staleTime: 60_000,
    queryFn: async (): Promise<Promotion[]> => {
      const { data } = await supabase.from('promotions').select('*').eq('is_active', true);
      const now = Date.now();
      return (data ?? []).filter((p) =>
        new Date(p.starts_at).getTime() <= now &&
        (!p.ends_at || new Date(p.ends_at).getTime() > now));
    },
  });
}

/* ───────────────────────────── Utilitaire ───────────────────────────── */

export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export type { InventoryHealth };
