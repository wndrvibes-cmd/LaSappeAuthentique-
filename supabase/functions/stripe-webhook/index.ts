/**
 * Edge Function — réception des événements de paiement Stripe.
 *
 * La signature est vérifiée avant toute écriture : sans elle, n'importe qui
 * pourrait marquer une commande comme payée. La vérification utilise
 * l'algorithme HMAC-SHA256 décrit par Stripe, implémenté ici avec l'API
 * Web Crypto (pas de dépendance supplémentaire).
 *
 * À la confirmation du paiement :
 *   • la commande passe en « payée » ;
 *   • le stock réservé est converti en sortie définitive ;
 *   • l'utilisation du code de réduction est enregistrée ;
 *   • l'email de confirmation est mis en file.
 */
import { errorResponse, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';

/** Tolérance sur l'horodatage, pour rejeter les rejeux. */
const TOLERANCE_SECONDS = 300;

async function verifySignature(
  payload: string, header: string, secret: string,
): Promise<boolean> {
  const parts = header.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  // Comparaison à temps constant
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse('Méthode non autorisée', 405);

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET absente');
    return errorResponse('Webhook non configuré', 503);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return errorResponse('Signature absente', 400);

  const body = await req.text();

  if (!(await verifySignature(body, signature, secret))) {
    console.error('[stripe-webhook] signature invalide');
    return errorResponse('Signature invalide', 400);
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(body);
  } catch {
    return errorResponse('Corps invalide', 400);
  }

  const db = serviceClient();
  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const orderId = metadata.order_id ?? (object.client_reference_id as string | undefined);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        if (!orderId) break;

        const { data: order } = await db
          .from('orders').select('*').eq('id', orderId).maybeSingle();
        if (!order) {
          console.error('[stripe-webhook] commande introuvable', orderId);
          break;
        }
        // Idempotence : un même événement peut être livré plusieurs fois
        if (order.payment_status === 'paid') break;

        await db.from('orders').update({
          status: 'paid',
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          payment_intent_id: (object.payment_intent as string) ?? order.payment_intent_id,
        }).eq('id', orderId);

        /* Conversion de la réservation en sortie de stock définitive */
        const { data: items } = await db
          .from('order_items').select('variant_id, quantity').eq('order_id', orderId);

        for (const item of items ?? []) {
          if (!item.variant_id) continue;
          const { data: level } = await db.from('inventory_levels')
            .select('on_hand, reserved').eq('variant_id', item.variant_id).maybeSingle();
          if (!level) continue;

          await db.from('inventory_levels').update({
            on_hand: Math.max(level.on_hand - item.quantity, 0),
            reserved: Math.max(level.reserved - item.quantity, 0),
          }).eq('variant_id', item.variant_id);

          await db.from('stock_movements').insert({
            variant_id: item.variant_id,
            delta: -item.quantity,
            reason: 'sale',
            reference: order.order_number,
            note: 'Vente confirmée par le paiement',
          });
        }

        /* Enregistrement de l'utilisation du code de réduction */
        if (order.discount_code && Number(order.discount_total) > 0) {
          const { data: discount } = await db.from('discounts')
            .select('id, used_count').eq('code', order.discount_code).maybeSingle();
          if (discount) {
            await db.from('discount_redemptions').insert({
              discount_id: discount.id, order_id: orderId,
              profile_id: order.profile_id, amount: order.discount_total,
            });
            await db.from('discounts')
              .update({ used_count: discount.used_count + 1 }).eq('id', discount.id);
          }
        }

        await db.from('order_events').insert({
          order_id: orderId, type: 'paid',
          payload: { amount: object.amount_total, currency: object.currency },
        });

        /* Email de confirmation */
        const resendKey = Deno.env.get('RESEND_API_KEY');
        const from = Deno.env.get('SHOP_EMAIL_FROM');

        if (resendKey && from) {
          const { data: lines } = await db.from('order_items')
            .select('product_name, variant_title, quantity, line_total').eq('order_id', orderId);

          const rows = (lines ?? []).map((l) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #E7DFD1">` +
            `${l.product_name}<br><span style="color:#6E6E7E;font-size:13px">${l.variant_title} · ×${l.quantity}</span></td>` +
            `<td style="padding:8px 0;border-bottom:1px solid #E7DFD1;text-align:right">` +
            `${Number(l.line_total).toFixed(2)} €</td></tr>`).join('');

          const html =
            `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#0C0C0E">` +
            `<p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C19A3E">La Sappe Authentique</p>` +
            `<h1 style="font-size:24px;margin:16px 0 8px">Merci pour votre commande</h1>` +
            `<p style="font-size:15px;line-height:1.6;color:#4A4A57">` +
            `Votre commande <strong>${order.order_number}</strong> est confirmée. ` +
            `Elle est préparée et remise au transporteur sous 24 heures ouvrées.</p>` +
            `<table style="width:100%;border-collapse:collapse;font-family:Helvetica,sans-serif;font-size:14px;margin:24px 0">` +
            rows +
            `<tr><td style="padding:12px 0;font-weight:bold">Total</td>` +
            `<td style="padding:12px 0;text-align:right;font-weight:bold">${Number(order.total).toFixed(2)} €</td></tr>` +
            `</table>` +
            `<p style="font-size:13px;color:#6E6E7E;line-height:1.6">` +
            `Vous disposez de 30 jours pour retourner une pièce non portée. ` +
            `Suivez votre commande depuis votre compte.</p></div>`;

          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from, to: order.email,
              subject: `Commande ${order.order_number} confirmée — La Sappe Authentique`,
              html,
            }),
          });
          const emailResult = await emailResponse.json();

          await db.from('email_log').insert({
            template: 'order_confirmation', recipient: order.email, order_id: orderId,
            subject: `Commande ${order.order_number} confirmée`,
            provider_id: emailResult?.id ?? null,
            status: emailResponse.ok ? 'sent' : 'failed',
            error: emailResponse.ok ? null : JSON.stringify(emailResult),
          });
        } else {
          // Sans prestataire d'email, on consigne au lieu de prétendre avoir envoyé
          await db.from('email_log').insert({
            template: 'order_confirmation', recipient: order.email, order_id: orderId,
            subject: `Commande ${order.order_number} confirmée`,
            status: 'queued',
            error: 'RESEND_API_KEY ou SHOP_EMAIL_FROM absente : email non envoyé',
          });
        }
        break;
      }

      case 'checkout.session.expired': {
        if (!orderId) break;
        // Le paiement a été abandonné : on libère le stock réservé
        const { data: items } = await db
          .from('order_items').select('variant_id, quantity').eq('order_id', orderId);
        for (const item of items ?? []) {
          if (!item.variant_id) continue;
          const { data: level } = await db.from('inventory_levels')
            .select('reserved').eq('variant_id', item.variant_id).maybeSingle();
          if (!level) continue;
          await db.from('inventory_levels').update({
            reserved: Math.max(level.reserved - item.quantity, 0),
          }).eq('variant_id', item.variant_id);
        }
        await db.from('orders').update({
          status: 'cancelled', payment_status: 'failed',
          cancelled_at: new Date().toISOString(),
          internal_note: 'Session de paiement expirée',
        }).eq('id', orderId);
        await db.from('order_events').insert({
          order_id: orderId, type: 'payment_expired', payload: {},
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        if (!orderId) break;
        await db.from('orders').update({
          payment_status: 'failed',
          internal_note: String(
            (object.last_payment_error as { message?: string } | null)?.message ?? 'Paiement refusé'),
        }).eq('id', orderId);
        await db.from('order_events').insert({
          order_id: orderId, type: 'payment_failed',
          payload: { error: object.last_payment_error ?? null },
        });
        break;
      }

      case 'charge.refunded': {
        const intentId = object.payment_intent as string | undefined;
        if (!intentId) break;
        const { data: order } = await db.from('orders')
          .select('id, total').eq('payment_intent_id', intentId).maybeSingle();
        if (!order) break;
        const refunded = Number(object.amount_refunded ?? 0) / 100;
        const full = refunded >= Number(order.total) - 0.01;
        await db.from('orders').update({
          status: full ? 'refunded' : 'paid',
          payment_status: full ? 'refunded' : 'partially_refunded',
        }).eq('id', order.id);
        await db.from('order_events').insert({
          order_id: order.id, type: 'refunded',
          payload: { amount: refunded, full },
        });
        break;
      }

      default:
        // Événement non traité : on l'acquitte sans rien faire
        break;
    }

    return jsonResponse({ received: true, type: event.type });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur interne';
    console.error('[stripe-webhook]', event.type, message);
    // On renvoie 500 pour que Stripe réessaie
    return errorResponse(message, 500);
  }
});
