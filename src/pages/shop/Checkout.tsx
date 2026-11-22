import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck } from 'lucide-react';
import { useCart } from '@/store/cart';
import { useAuth } from '@/hooks/useAuth';
import { useShippingMethods, useShopSettings } from '@/hooks/useShop';
import { invokeFunction, productImageUrl } from '@/lib/supabase';
import { formatPrice } from '@/lib/format';
import { Button, Checkbox, Field, Input, LoadingBlock, Notice, Select, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

const COUNTRIES = [
  ['FR', 'France'], ['BE', 'Belgique'], ['LU', 'Luxembourg'], ['CH', 'Suisse'],
  ['DE', 'Allemagne'], ['IT', 'Italie'], ['ES', 'Espagne'], ['NL', 'Pays-Bas'],
  ['PT', 'Portugal'], ['GB', 'Royaume-Uni'], ['CA', 'Canada'], ['SN', 'Sénégal'],
  ['CI', "Côte d'Ivoire"], ['CD', 'République démocratique du Congo'],
] as const;

interface CheckoutResponse {
  orderId: string;
  orderNumber: string;
  /** URL de la page de paiement du prestataire, si configuré. */
  paymentUrl?: string | null;
  /** Mode de règlement retenu par le serveur. */
  mode: 'stripe' | 'manual';
  message?: string;
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { lines, discount, subtotal, discountAmount, load, loading } = useCart();
  const { data: settings } = useShopSettings();

  const [country, setCountry] = useState('FR');
  const { data: methods } = useShippingMethods(country);

  const [form, setForm] = useState({
    email: '', fullName: '', phone: '',
    line1: '', line2: '', postalCode: '', city: '',
    note: '', sameBilling: true,
    billingLine1: '', billingPostalCode: '', billingCity: '', billingCountry: 'FR',
  });
  const [methodId, setMethodId] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (profile) {
      setForm((f) => ({
        ...f,
        email: f.email || profile.email,
        fullName: f.fullName || (profile.full_name ?? ''),
        phone: f.phone || (profile.phone ?? ''),
      }));
    }
  }, [profile]);

  useEffect(() => {
    if (methods?.length && !methods.some((m) => m.id === methodId)) setMethodId(methods[0].id);
  }, [methods, methodId]);

  const sub = subtotal();
  const disc = discountAmount();
  const method = methods?.find((m) => m.id === methodId) ?? null;

  const shippingCost = useMemo(() => {
    if (!method) return 0;
    if (discount?.free_shipping) return 0;
    if (method.free_above !== null && sub - disc >= Number(method.free_above)) return 0;
    return Number(method.price);
  }, [method, sub, disc, discount]);

  const total = Math.max(sub - disc + shippingCost, 0);

  if (loading && !lines.length) return <LoadingBlock label="Préparation de la commande…" />;

  if (!lines.length) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl text-ink">Votre panier est vide</h1>
        <p className="mt-2 text-sm text-ink-400">Ajoutez une pièce avant de passer commande.</p>
        <Link to="/boutique" className="link-underline mt-6 inline-block text-sm font-medium">
          Découvrir le vestiaire
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!method) { setError('Choisissez un mode de livraison.'); return; }
    if (!acceptTerms) { setError('Vous devez accepter les conditions générales de vente.'); return; }

    setSubmitting(true);
    const { data, error: fnError } = await invokeFunction<CheckoutResponse>('checkout', {
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      customerNote: form.note.trim() || null,
      shippingMethodId: method.id,
      discountCode: discount?.valid ? discount.code : null,
      shippingAddress: {
        full_name: form.fullName.trim(), line1: form.line1.trim(),
        line2: form.line2.trim() || null, postal_code: form.postalCode.trim(),
        city: form.city.trim(), country_code: country, phone: form.phone.trim() || null,
      },
      billingAddress: form.sameBilling ? null : {
        full_name: form.fullName.trim(), line1: form.billingLine1.trim(),
        postal_code: form.billingPostalCode.trim(), city: form.billingCity.trim(),
        country_code: form.billingCountry,
      },
      successUrl: `${window.location.origin}/commande/confirmee`,
      cancelUrl: `${window.location.origin}/commande`,
    });
    setSubmitting(false);

    if (fnError || !data) {
      setError(fnError ?? 'La commande n’a pas pu être enregistrée.');
      return;
    }

    if (data.paymentUrl) {
      // Redirection vers la page de paiement du prestataire
      window.location.href = data.paymentUrl;
      return;
    }

    // Aucun prestataire de paiement configuré : la commande est enregistrée
    // en attente de règlement, et le client en est informé sans ambiguïté.
    navigate(`/commande/confirmee?numero=${encodeURIComponent(data.orderNumber)}&mode=${data.mode}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-display text-display-md font-semibold text-ink">Finaliser la commande</h1>

      <form onSubmit={submit} className="mt-8 lg:grid lg:grid-cols-[1fr_22rem] lg:gap-12">
        <div className="space-y-10">
          {/* Contact */}
          <section>
            <h2 className="font-display text-lg text-ink">1. Vos coordonnées</h2>
            {!user && (
              <p className="mt-1.5 text-[0.8125rem] text-ink-400">
                Vous commandez sans compte.{' '}
                <Link to="/connexion" className="link-underline font-medium text-ink">
                  Se connecter
                </Link>{' '}
                permet de suivre vos commandes.
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Adresse email" required className="sm:col-span-2">
                <Input type="email" required autoComplete="email" value={form.email}
                       onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Nom complet" required>
                <Input required autoComplete="name" value={form.fullName}
                       onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </Field>
              <Field label="Téléphone" hint="Utilisé par le transporteur en cas de besoin">
                <Input type="tel" autoComplete="tel" value={form.phone}
                       onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
            </div>
          </section>

          {/* Livraison */}
          <section>
            <h2 className="font-display text-lg text-ink">2. Adresse de livraison</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Pays" required className="sm:col-span-2">
                <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </Select>
              </Field>
              <Field label="Adresse" required className="sm:col-span-2">
                <Input required autoComplete="address-line1" value={form.line1}
                       onChange={(e) => setForm({ ...form, line1: e.target.value })} />
              </Field>
              <Field label="Complément d'adresse" className="sm:col-span-2">
                <Input autoComplete="address-line2" value={form.line2}
                       onChange={(e) => setForm({ ...form, line2: e.target.value })} />
              </Field>
              <Field label="Code postal" required>
                <Input required autoComplete="postal-code" value={form.postalCode}
                       onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
              </Field>
              <Field label="Ville" required>
                <Input required autoComplete="address-level2" value={form.city}
                       onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
            </div>

            <div className="mt-5">
              <Checkbox
                label="L'adresse de facturation est identique"
                checked={form.sameBilling}
                onChange={(e) => setForm({ ...form, sameBilling: e.target.checked })}
              />
            </div>

            {!form.sameBilling && (
              <div className="mt-5 grid gap-4 rounded-lg border border-ivory-300 bg-ivory-200/40 p-5 sm:grid-cols-2">
                <Field label="Adresse de facturation" required className="sm:col-span-2">
                  <Input required value={form.billingLine1}
                         onChange={(e) => setForm({ ...form, billingLine1: e.target.value })} />
                </Field>
                <Field label="Code postal" required>
                  <Input required value={form.billingPostalCode}
                         onChange={(e) => setForm({ ...form, billingPostalCode: e.target.value })} />
                </Field>
                <Field label="Ville" required>
                  <Input required value={form.billingCity}
                         onChange={(e) => setForm({ ...form, billingCity: e.target.value })} />
                </Field>
                <Field label="Pays" required className="sm:col-span-2">
                  <Select value={form.billingCountry}
                          onChange={(e) => setForm({ ...form, billingCountry: e.target.value })}>
                    {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </Select>
                </Field>
              </div>
            )}
          </section>

          {/* Mode de livraison */}
          <section>
            <h2 className="font-display text-lg text-ink">3. Mode de livraison</h2>
            {methods?.length ? (
              <div className="mt-5 space-y-2.5">
                {methods.map((m) => {
                  const free = discount?.free_shipping ||
                    (m.free_above !== null && sub - disc >= Number(m.free_above));
                  return (
                    <label key={m.id} className={cn(
                      'flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-4 py-3.5 transition-colors',
                      methodId === m.id ? 'border-ink bg-ink/[0.02]' : 'border-ivory-400 hover:border-ink/30',
                    )}>
                      <div className="flex items-start gap-3">
                        <input
                          type="radio" name="shipping" checked={methodId === m.id}
                          onChange={() => setMethodId(m.id)}
                          className="mt-1 h-4 w-4 accent-ink"
                        />
                        <div>
                          <p className="text-[0.875rem] font-medium text-ink">{m.name}</p>
                          <p className="text-[0.75rem] text-ink-400">
                            {m.carrier ? `${m.carrier} · ` : ''}
                            {m.delay_min_days === m.delay_max_days
                              ? `${m.delay_min_days} jour${m.delay_min_days > 1 ? 's' : ''} ouvré${m.delay_min_days > 1 ? 's' : ''}`
                              : `${m.delay_min_days} à ${m.delay_max_days} jours ouvrés`}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-[0.875rem] font-medium tabular">
                        {free ? <span className="text-signal-success">Offerte</span> : formatPrice(Number(m.price))}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Notice tone="warning" className="mt-5" title="Aucun mode de livraison pour ce pays">
                Aucune zone de livraison ne couvre le pays sélectionné. Choisissez un autre
                pays, ou configurez une zone depuis l'administration
                (Paramètres → Livraison).
              </Notice>
            )}
          </section>

          {/* Note */}
          <section>
            <h2 className="font-display text-lg text-ink">4. Précisions</h2>
            <Field label="Message pour la préparation de commande" className="mt-5">
              <Textarea rows={3} value={form.note} maxLength={500}
                        placeholder="Code d'accès, créneau souhaité, demande de retouche…"
                        onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </section>
        </div>

        {/* Récapitulatif */}
        <aside className="mt-10 lg:mt-0">
          <div className="sticky top-28 rounded-lg border border-ivory-300 bg-white p-5 shadow-card">
            <h2 className="font-display text-base text-ink">Votre commande</h2>

            <ul className="mt-4 max-h-64 space-y-3.5 overflow-y-auto">
              {lines.map((l) => (
                <li key={l.variantId} className="flex gap-3">
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-ivory-200">
                    {productImageUrl(l.imagePath) ? (
                      <img src={productImageUrl(l.imagePath)!} alt="" aria-hidden
                           className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-ink-300">
                        {l.productName.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-medium text-ink">{l.productName}</p>
                    <p className="text-[0.75rem] text-ink-400">{l.variantTitle} · ×{l.quantity}</p>
                  </div>
                  <span className="shrink-0 text-[0.8125rem] tabular text-ink">
                    {formatPrice(l.unitPrice * l.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-2.5 border-t border-ivory-300 pt-5 text-[0.875rem]">
              <div className="flex justify-between">
                <dt className="text-ink-500">Sous-total</dt>
                <dd className="tabular">{formatPrice(sub)}</dd>
              </div>
              {disc > 0 && (
                <div className="flex justify-between text-signal-success">
                  <dt>Réduction</dt><dd className="tabular">− {formatPrice(disc)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-500">Livraison</dt>
                <dd className="tabular">
                  {shippingCost === 0
                    ? <span className="text-signal-success">Offerte</span>
                    : formatPrice(shippingCost)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ivory-300 pt-3 text-base font-medium">
                <dt>Total</dt><dd className="tabular">{formatPrice(total)}</dd>
              </div>
              {settings?.prices_include_vat && (
                <p className="text-[0.6875rem] text-ink-400">
                  TVA {Math.round(Number(settings.vat_rate) * 100)} % incluse
                </p>
              )}
            </dl>

            <div className="mt-5">
              <Checkbox
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                label={
                  <span className="text-[0.75rem] leading-relaxed">
                    J'accepte les{' '}
                    <Link to="/cgv" className="link-underline font-medium">conditions générales de vente</Link>
                    {' '}et la{' '}
                    <Link to="/confidentialite" className="link-underline font-medium">politique de confidentialité</Link>.
                  </span>
                }
              />
            </div>

            {error && <Notice tone="danger" className="mt-4">{error}</Notice>}

            <Button type="submit" size="lg" fullWidth className="mt-5"
                    loading={submitting} icon={<Lock className="h-3.5 w-3.5" />}>
              Payer {formatPrice(total)}
            </Button>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[0.6875rem] text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Paiement chiffré · aucune donnée bancaire conservée
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
