/**
 * Edge Function — création de commande et ouverture du paiement.
 *
 * Déroulement :
 *  1. lecture du panier côté serveur (le client ne décide ni des prix ni des
 *     stocks : tout est revérifié ici) ;
 *  2. contrôle de disponibilité variante par variante ;
 *  3. recalcul du sous-total, de la remise et du port à partir de la base ;
 *  4. création de la commande et de ses lignes, avec le coût des marchandises
 *     figé pour que la marge réalisée reste exacte ;
 *  5. réservation du stock ;
 *  6. ouverture d'une session de paiement Stripe si la clé est configurée.
 *     Sinon la commande reste « en attente de règlement » et le client en est
 *     informé explicitement — aucune transaction n'est simulée.
 */
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { serviceClient, userClient } from '../_shared/supabase.ts';

interface AddressInput {
  full_name: string; line1: string; line2?: string | null;
  postal_code: string; city: string; country_code: string; phone?: string | null;
}

interface CheckoutPayload {
  email: string;
  phone?: string | null;
  customerNote?: string | null;
  shippingMethodId: string;
  discountCode?: string | null;
  shippingAddress: AddressInput;
  billingAddress?: AddressInput | null;
  successUrl: string;
  cancelUrl: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return errorResponse('Méthode non autorisée', 405);

  let payload: CheckoutPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Corps de requête invalide');
  }

  if (!payload.email?.includes('@')) return errorResponse('Adresse email invalide');
  if (!payload.shippingMethodId) return errorResponse('Mode de livraison manquant');
  if (!payload.shippingAddress?.line1 || !payload.shippingAddress?.city) {
    return errorResponse('Adresse de livraison incomplète');
  }

  const db = serviceClient();

  try {
    /* ── 1. Identification de l'appelant et de son panier ── */
    const client = userClient(req);
    const { data: auth } = await client.auth.getUser();
    const profileId = auth.user?.id ?? null;
    const cartToken = req.headers.get('x-cart-token');

    let cartQuery = db.from('carts').select('id, discount_code');
    cartQuery = profileId
      ? cartQuery.eq('profile_id', profileId)
      : cartToken
        ? cartQuery.eq('guest_token', cartToken)
        : cartQuery.eq('id', '00000000-0000-0000-0000-000000000000');

    const { data: cart } = await cartQuery.maybeSingle();
    if (!cart) return errorResponse('Panier introuvable', 404);

    const { data: items } = await db
      .from('cart_items').select('variant_id, quantity').eq('cart_id', cart.id);
    if (!items?.length) return errorResponse('Le panier est vide');

    /* ── 2 & 3. Prix, coûts et disponibilité relus en base ── */
    const variantIds = items.map((i) => i.variant_id);
    const [{ data: pricing }, { data: availability }, { data: images }] = await Promise.all([
      db.from('variant_pricing').select('*').in('variant_id', variantIds),
      db.from('variant_availability').select('variant_id, available').in('variant_id', variantIds),
      db.from('product_images').select('product_id, storage_path, position').order('position'),
    ]);

    const priceBy = new Map((pricing ?? []).map((p) => [p.variant_id, p]));
    const availBy = new Map((availability ?? []).map((a) => [a.variant_id, a.available]));
    const imageBy = new Map<string, string>();
    for (const img of images ?? []) {
      if (!imageBy.has(img.product_id)) imageBy.set(img.product_id, img.storage_path);
    }

    const lines: {
      variant_id: string; product_name: string; variant_title: string; sku: string;
      unit_price: number; unit_cost: number; quantity: number; line_total: number;
      image_path: string | null;
    }[] = [];

    for (const item of items) {
      const p = priceBy.get(item.variant_id);
      if (!p) return errorResponse('Un article du panier n’est plus disponible à la vente');
      if (p.status !== 'active') {
        return errorResponse(`« ${p.product_name} » n’est plus en vente`);
      }
      const available = availBy.get(item.variant_id) ?? 0;
      if (available < item.quantity) {
        return errorResponse(
          `Stock insuffisant pour « ${p.product_name} » (${p.variant_title}) : ` +
          `${available} disponible(s) pour ${item.quantity} demandé(s)`,
        );
      }

      const unitPrice = Number(p.price);
      lines.push({
        variant_id: item.variant_id,
        product_name: p.product_name,
        variant_title: p.variant_title,
        sku: p.sku,
        unit_price: unitPrice,
        unit_cost: Number(p.cost_price ?? 0),
        quantity: item.quantity,
        line_total: Math.round(unitPrice * item.quantity * 100) / 100,
        image_path: imageBy.get(p.product_id) ?? null,
      });
    }

    const subtotal = Math.round(lines.reduce((s, l) => s + l.line_total, 0) * 100) / 100;
    const cogsTotal = Math.round(lines.reduce((s, l) => s + l.unit_cost * l.quantity, 0) * 100) / 100;

    /* Remise : revalidée par la fonction SQL, jamais par le client */
    let discountTotal = 0;
    let discountId: string | null = null;
    let freeShipping = false;
    const code = payload.discountCode ?? cart.discount_code;
    if (code) {
      const { data: validation } = await db.rpc('validate_discount', {
        p_code: code, p_subtotal: subtotal, p_profile_id: profileId,
      });
      const v = validation as { valid?: boolean; amount?: number; discount_id?: string;
                               free_shipping?: boolean; reason?: string } | null;
      if (v?.valid) {
        discountTotal = Number(v.amount ?? 0);
        discountId = v.discount_id ?? null;
        freeShipping = Boolean(v.free_shipping);
      }
      // Un code devenu invalide est simplement ignoré : la commande n'échoue pas.
    }

    /* Livraison : tarif relu en base */
    const { data: method } = await db
      .from('shipping_methods').select('*').eq('id', payload.shippingMethodId)
      .eq('is_active', true).maybeSingle();
    if (!method) return errorResponse('Mode de livraison indisponible');

    const netSubtotal = subtotal - discountTotal;
    const shippingTotal = freeShipping
      || (method.free_above !== null && netSubtotal >= Number(method.free_above))
        ? 0
        : Number(method.price);

    const { data: settings } = await db
      .from('shop_settings').select('vat_rate, prices_include_vat, currency').maybeSingle();
    const vatRate = Number(settings?.vat_rate ?? 0.2);
    const currency = settings?.currency ?? 'EUR';
    const total = Math.round((netSubtotal + shippingTotal) * 100) / 100;
    // TVA incluse dans les prix affichés : on l'isole pour la commande
    const taxTotal = settings?.prices_include_vat
      ? Math.round((total - total / (1 + vatRate)) * 100) / 100
      : Math.round(total * vatRate * 100) / 100;

    /* ── 4. Création de la commande ── */
    const { data: order, error: orderError } = await db.from('orders').insert({
      profile_id: profileId,
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone ?? null,
      status: 'pending',
      payment_status: 'pending',
      currency,
      subtotal, discount_total: discountTotal, shipping_total: shippingTotal,
      tax_total: taxTotal, total, cogs_total: cogsTotal,
      discount_code: discountId ? code : null,
      shipping_method_id: method.id,
      shipping_address: payload.shippingAddress,
      billing_address: payload.billingAddress ?? payload.shippingAddress,
      customer_note: payload.customerNote ?? null,
      payment_provider: 'stripe',
      placed_at: new Date().toISOString(),
    }).select('*').single();

    if (orderError || !order) {
      return errorResponse(`La commande n’a pas pu être enregistrée : ${orderError?.message}`, 500);
    }

    const { error: itemsError } = await db.from('order_items').insert(
      lines.map((l) => ({ ...l, order_id: order.id })),
    );
    if (itemsError) {
      await db.from('orders').delete().eq('id', order.id);
      return errorResponse(`Enregistrement des articles impossible : ${itemsError.message}`, 500);
    }

    /* ── 5. Réservation du stock ── */
    for (const l of lines) {
      const { data: level } = await db.from('inventory_levels')
        .select('reserved').eq('variant_id', l.variant_id).maybeSingle();
      await db.from('inventory_levels').upsert({
        variant_id: l.variant_id,
        reserved: (level?.reserved ?? 0) + l.quantity,
      }, { onConflict: 'variant_id' });
    }

    await db.from('order_events').insert({
      order_id: order.id, type: 'created',
      payload: { lines: lines.length, subtotal, total, discount_code: code ?? null },
    });

    /* ── 6. Paiement ── */
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!stripeKey) {
      // Aucun prestataire configuré : on le dit, on ne simule rien.
      await db.from('order_events').insert({
        order_id: order.id, type: 'payment_pending_no_provider',
        payload: { reason: 'STRIPE_SECRET_KEY absente' },
      });
      await db.from('email_log').insert({
        template: 'order_pending_payment', recipient: order.email,
        order_id: order.id, subject: `Commande ${order.order_number} — règlement à finaliser`,
        status: 'queued',
      });
      return jsonResponse({
        orderId: order.id,
        orderNumber: order.order_number,
        paymentUrl: null,
        mode: 'manual',
        message:
          "Commande enregistrée en attente de règlement : aucun prestataire de paiement " +
          "n'est configuré (STRIPE_SECRET_KEY).",
      });
    }

    /* Session Stripe Checkout, créée côté serveur */
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', `${payload.successUrl}?numero=${order.order_number}&mode=stripe`);
    form.set('cancel_url', payload.cancelUrl);
    form.set('customer_email', order.email);
    form.set('client_reference_id', order.id);
    form.set('metadata[order_id]', order.id);
    form.set('metadata[order_number]', order.order_number);
    form.set('payment_intent_data[metadata][order_id]', order.id);

    lines.forEach((l, i) => {
      form.set(`line_items[${i}][quantity]`, String(l.quantity));
      form.set(`line_items[${i}][price_data][currency]`, currency.toLowerCase());
      form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(l.unit_price * 100)));
      form.set(`line_items[${i}][price_data][product_data][name]`,
               `${l.product_name} — ${l.variant_title}`);
    });

    let idx = lines.length;
    if (shippingTotal > 0) {
      form.set(`line_items[${idx}][quantity]`, '1');
      form.set(`line_items[${idx}][price_data][currency]`, currency.toLowerCase());
      form.set(`line_items[${idx}][price_data][unit_amount]`, String(Math.round(shippingTotal * 100)));
      form.set(`line_items[${idx}][price_data][product_data][name]`, `Livraison — ${method.name}`);
      idx += 1;
    }
    if (discountTotal > 0) {
      // Stripe n'accepte pas de ligne négative : on utilise une remise de session
      form.set('discounts[0][coupon_data][name]', code ?? 'Remise');
      form.set('discounts[0][coupon_data][amount_off]', String(Math.round(discountTotal * 100)));
      form.set('discounts[0][coupon_data][currency]', currency.toLowerCase());
      form.set('discounts[0][coupon_data][duration]', 'once');
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      const message = session?.error?.message ?? 'Erreur du prestataire de paiement';
      await db.from('orders').update({
        internal_note: `Échec d'ouverture du paiement : ${message}`,
      }).eq('id', order.id);
      await db.from('order_events').insert({
        order_id: order.id, type: 'payment_session_failed', payload: { message },
      });
      return errorResponse(`Le paiement n'a pas pu être ouvert : ${message}`, 502);
    }

    await db.from('orders').update({ payment_intent_id: session.id }).eq('id', order.id);

    return jsonResponse({
      orderId: order.id,
      orderNumber: order.order_number,
      paymentUrl: session.url,
      mode: 'stripe',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur interne';
    console.error('[checkout]', message);
    return errorResponse(message, 500);
  }
});
