/**
 * Panier.
 *
 * Le panier vit dans la base (table `carts`) et non dans le navigateur :
 * il survit au changement d'appareil et permet au back-office de mesurer
 * les abandons. Un visiteur non connecté est identifié par un jeton
 * `guest_token` transmis via l'en-tête `x-cart-token`, que les politiques
 * RLS vérifient. À la connexion, le panier invité est fusionné.
 */
import { create } from 'zustand';
import { getGuestToken, supabase } from '@/lib/supabase';
import type { DiscountValidation } from '@/types/database';

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantTitle: string;
  sku: string;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  available: number;
  imagePath: string | null;
}

interface CartState {
  cartId: string | null;
  lines: CartLine[];
  discount: DiscountValidation | null;
  loading: boolean;
  busyVariantId: string | null;
  error: string | null;

  subtotal: () => number;
  discountAmount: () => number;
  itemCount: () => number;

  load: () => Promise<void>;
  add: (variantId: string, quantity?: number) => Promise<{ error: string | null }>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  remove: (variantId: string) => Promise<void>;
  clear: () => Promise<void>;
  applyDiscount: (code: string) => Promise<{ error: string | null }>;
  removeDiscount: () => void;
  mergeGuestCart: (profileId: string) => Promise<void>;
}

/** Récupère ou crée le panier courant. */
async function resolveCartId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const profileId = auth.user?.id ?? null;

  if (profileId) {
    const { data: existing } = await supabase
      .from('carts').select('id').eq('profile_id', profileId).maybeSingle();
    if (existing) return existing.id;
    const { data: created } = await supabase
      .from('carts').insert({ profile_id: profileId }).select('id').single();
    return created?.id ?? null;
  }

  const token = getGuestToken();
  const { data: existing } = await supabase
    .from('carts').select('id').eq('guest_token', token).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from('carts').insert({ guest_token: token }).select('id').single();
  return created?.id ?? null;
}

async function fetchLines(cartId: string): Promise<CartLine[]> {
  const { data: items } = await supabase
    .from('cart_items').select('id, variant_id, quantity').eq('cart_id', cartId);
  if (!items?.length) return [];

  const variantIds = items.map((i) => i.variant_id);
  const [{ data: pricing }, { data: availability }, { data: images }] = await Promise.all([
    supabase.from('catalog_pricing').select('*').in('variant_id', variantIds),
    supabase.from('variant_availability').select('variant_id, available').in('variant_id', variantIds),
    supabase.from('product_images').select('product_id, storage_path, position').order('position'),
  ]);

  const priceBy = new Map((pricing ?? []).map((p) => [p.variant_id, p]));
  const availBy = new Map((availability ?? []).map((a) => [a.variant_id, a.available]));
  const imageBy = new Map<string, string>();
  for (const img of images ?? []) if (!imageBy.has(img.product_id)) imageBy.set(img.product_id, img.storage_path);

  return items
    .map((item) => {
      const p = priceBy.get(item.variant_id);
      if (!p) return null;
      return {
        itemId: item.id,
        variantId: item.variant_id,
        productId: p.product_id,
        productSlug: p.product_slug,
        productName: p.product_name,
        variantTitle: p.variant_title,
        sku: p.sku,
        unitPrice: Number(p.price),
        compareAtPrice: p.compare_at_price !== null ? Number(p.compare_at_price) : null,
        quantity: item.quantity,
        available: availBy.get(item.variant_id) ?? 0,
        imagePath: imageBy.get(p.product_id) ?? null,
      } satisfies CartLine;
    })
    .filter((l): l is CartLine => l !== null);
}

export const useCart = create<CartState>((set, get) => ({
  cartId: null,
  lines: [],
  discount: null,
  loading: false,
  busyVariantId: null,
  error: null,

  subtotal: () => get().lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  discountAmount: () => {
    const d = get().discount;
    if (!d?.valid) return 0;
    return Math.min(Number(d.amount ?? 0), get().subtotal());
  },
  itemCount: () => get().lines.reduce((s, l) => s + l.quantity, 0),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const cartId = await resolveCartId();
      if (!cartId) { set({ loading: false, lines: [] }); return; }
      const lines = await fetchLines(cartId);
      set({ cartId, lines, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Panier indisponible' });
    }
  },

  add: async (variantId, quantity = 1) => {
    set({ busyVariantId: variantId, error: null });
    try {
      const cartId = get().cartId ?? (await resolveCartId());
      if (!cartId) throw new Error('Panier indisponible');

      // Contrôle de stock avant ajout : on ne laisse pas commander l'indisponible
      const { data: avail } = await supabase
        .from('variant_availability').select('available').eq('variant_id', variantId).maybeSingle();
      const existing = get().lines.find((l) => l.variantId === variantId);
      const target = (existing?.quantity ?? 0) + quantity;
      const stock = avail?.available ?? 0;

      if (stock <= 0) {
        set({ busyVariantId: null });
        return { error: 'Cette taille n’est plus disponible.' };
      }
      if (target > stock) {
        set({ busyVariantId: null });
        return { error: `Il ne reste que ${stock} pièce(s) dans cette taille.` };
      }

      const { error } = await supabase
        .from('cart_items')
        .upsert({ cart_id: cartId, variant_id: variantId, quantity: target },
                { onConflict: 'cart_id,variant_id' });
      if (error) throw error;

      set({ cartId });
      await get().load();
      set({ busyVariantId: null });
      return { error: null };
    } catch (e) {
      set({ busyVariantId: null });
      return { error: e instanceof Error ? e.message : 'Ajout impossible' };
    }
  },

  setQuantity: async (variantId, quantity) => {
    const { cartId } = get();
    if (!cartId) return;
    if (quantity <= 0) { await get().remove(variantId); return; }
    set({ busyVariantId: variantId });
    await supabase.from('cart_items').update({ quantity })
      .eq('cart_id', cartId).eq('variant_id', variantId);
    await get().load();
    set({ busyVariantId: null });
  },

  remove: async (variantId) => {
    const { cartId } = get();
    if (!cartId) return;
    set({ busyVariantId: variantId });
    await supabase.from('cart_items').delete().eq('cart_id', cartId).eq('variant_id', variantId);
    await get().load();
    set({ busyVariantId: null });
  },

  clear: async () => {
    const { cartId } = get();
    if (!cartId) return;
    await supabase.from('cart_items').delete().eq('cart_id', cartId);
    set({ lines: [], discount: null });
  },

  applyDiscount: async (code) => {
    const subtotal = get().subtotal();
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc('validate_discount', {
      p_code: code, p_subtotal: subtotal, p_profile_id: auth.user?.id ?? null,
    });
    if (error) return { error: 'Vérification du code impossible.' };
    const result = data as unknown as DiscountValidation;
    if (!result?.valid) return { error: result?.reason ?? 'Code non valable.' };
    set({ discount: result });
    const { cartId } = get();
    if (cartId) await supabase.from('carts').update({ discount_code: result.code }).eq('id', cartId);
    return { error: null };
  },

  removeDiscount: () => {
    set({ discount: null });
    const { cartId } = get();
    if (cartId) void supabase.from('carts').update({ discount_code: null }).eq('id', cartId);
  },

  /** Fusionne le panier invité dans le panier du compte à la connexion. */
  mergeGuestCart: async (profileId) => {
    const token = getGuestToken();
    const { data: guestCart } = await supabase
      .from('carts').select('id').eq('guest_token', token).maybeSingle();
    if (!guestCart) { await get().load(); return; }

    const { data: userCart } = await supabase
      .from('carts').select('id').eq('profile_id', profileId).maybeSingle();

    if (!userCart) {
      // Le panier invité devient celui du compte
      await supabase.from('carts')
        .update({ profile_id: profileId, guest_token: null }).eq('id', guestCart.id);
    } else {
      const { data: guestItems } = await supabase
        .from('cart_items').select('variant_id, quantity').eq('cart_id', guestCart.id);
      for (const item of guestItems ?? []) {
        const { data: existing } = await supabase.from('cart_items')
          .select('quantity').eq('cart_id', userCart.id).eq('variant_id', item.variant_id).maybeSingle();
        await supabase.from('cart_items').upsert(
          { cart_id: userCart.id, variant_id: item.variant_id,
            quantity: (existing?.quantity ?? 0) + item.quantity },
          { onConflict: 'cart_id,variant_id' });
      }
      await supabase.from('carts').delete().eq('id', guestCart.id);
    }
    await get().load();
  },
}));
