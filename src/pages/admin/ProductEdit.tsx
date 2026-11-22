import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Brain, Trash2, Upload } from 'lucide-react';
import { useAdminProduct, useSaveProduct, useAdjustStock } from '@/hooks/useAdmin';
import { useAdminCategories, useAdminSuppliers } from '@/hooks/useAdmin';
import { computeBreakdown, computePricingGrid } from '@/lib/nexscope/engines/profit-margin';
import { AdminHeader, AdminPage } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, CardHeader, Checkbox, ErrorBlock, Field, Input,
         LoadingBlock, Notice, Select, Table, Td, Textarea, Th } from '@/components/ui';
import { formatPercent, formatPrice } from '@/lib/format';
import { productImageUrl, supabase } from '@/lib/supabase';
import { slugify, parseList, cn } from '@/lib/utils';
import type { Product, ProductOptionValue } from '@/types/database';

const TABS = ['informations', 'prix', 'variantes', 'visuels', 'seo'] as const;
const TAB_LABEL: Record<typeof TABS[number], string> = {
  informations: 'Informations', prix: 'Prix et coûts', variantes: 'Variantes & stock',
  visuels: 'Visuels', seo: 'Référencement',
};

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'nouveau';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: detail, isLoading, error } = useAdminProduct(isNew ? undefined : id);
  const { data: categories } = useAdminCategories();
  const { data: suppliers } = useAdminSuppliers();
  const save = useSaveProduct();
  const adjustStock = useAdjustStock();

  const [tab, setTab] = useState<typeof TABS[number]>('informations');
  const [form, setForm] = useState<Partial<Product>>({
    name: '', slug: '', status: 'draft', base_price: 0, currency: 'EUR',
    inbound_shipping: 0, handling_fee: 0, payment_fee_rate: 0.029,
    payment_fee_fixed: 0.25, ad_spend_ratio: 0, return_rate: 0.12,
    return_fee: 8, lead_time_days: 21, tags: [], is_featured: false,
    brand: 'La Sappe Authentique',
  });
  const [tagsText, setTagsText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('shop_settings').select('*').maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (detail?.product) {
      setForm(detail.product);
      setTagsText(detail.product.tags.join(', '));
    }
  }, [detail]);

  if (!isNew && isLoading) return <AdminPage><LoadingBlock /></AdminPage>;
  if (!isNew && error) {
    return <AdminPage><ErrorBlock message={error instanceof Error ? error.message : null} /></AdminPage>;
  }

  /* Calcul de marge en direct, avec le moteur Nexscope */
  const marginPreview = form.base_price && form.base_price > 0
    ? computeBreakdown({
        sku: form.slug ?? '', name: form.name ?? '',
        sellingPrice: Number(form.base_price),
        vatRate: Number(settings?.vat_rate ?? 0.2),
        pricesIncludeVat: settings?.prices_include_vat ?? true,
        productCost: Number(form.cost_price ?? 0),
        inboundShipping: Number(form.inbound_shipping ?? 0),
        handlingFee: Number(form.handling_fee ?? 0),
        outboundShipping: 0,
        paymentFeeRate: Number(form.payment_fee_rate ?? 0.029),
        paymentFeeFixed: Number(form.payment_fee_fixed ?? 0.25),
        adSpendRatio: Number(form.ad_spend_ratio ?? 0),
        returnRate: Number(form.return_rate ?? 0),
        returnFee: Number(form.return_fee ?? 0),
        otherFees: 0,
      })
    : null;

  const pricingGrid = form.base_price && form.base_price > 0
    ? computePricingGrid({
        sku: '', name: '', sellingPrice: Number(form.base_price),
        vatRate: Number(settings?.vat_rate ?? 0.2),
        pricesIncludeVat: settings?.prices_include_vat ?? true,
        productCost: Number(form.cost_price ?? 0),
        inboundShipping: Number(form.inbound_shipping ?? 0),
        handlingFee: Number(form.handling_fee ?? 0),
        outboundShipping: 0,
        paymentFeeRate: Number(form.payment_fee_rate ?? 0.029),
        paymentFeeFixed: Number(form.payment_fee_fixed ?? 0.25),
        adSpendRatio: Number(form.ad_spend_ratio ?? 0),
        returnRate: Number(form.return_rate ?? 0),
        returnFee: Number(form.return_fee ?? 0),
        otherFees: 0,
      }, [0.2, 0.25, 0.3, 0.4])
    : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const payload: Partial<Product> & { id?: string } = {
      ...form,
      slug: form.slug || slugify(form.name ?? ''),
      tags: parseList(tagsText),
      published_at: form.status === 'active' && !form.published_at
        ? new Date().toISOString() : form.published_at,
    };
    if (!isNew) payload.id = id;

    try {
      const result = await save.mutateAsync(payload);
      setFeedback('Produit enregistré.');
      setTimeout(() => setFeedback(null), 3000);
      if (isNew && result) navigate(`/admin/produits/${result.id}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'product', id] });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    }
  }

  async function uploadImage(file: File) {
    if (isNew || !id) return;
    const path = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`;
    const { error: upErr } = await supabase.storage.from('product-images').upload(path, file);
    if (upErr) { setSaveError(`Dépôt du visuel impossible : ${upErr.message}`); return; }
    const { count } = await supabase.from('product_images')
      .select('id', { count: 'exact', head: true }).eq('product_id', id);
    await supabase.from('product_images').insert({
      product_id: id, storage_path: path, alt: form.name ?? null, position: count ?? 0,
    });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'product', id] });
  }

  return (
    <AdminPage>
      <Link to="/admin/produits"
            className="mb-5 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-400 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Tous les produits
      </Link>

      <AdminHeader
        eyebrow={isNew ? 'Nouveau' : 'Modification'}
        title={isNew ? 'Créer un produit' : (form.name || 'Produit')}
        action={
          <div className="flex gap-2.5">
            {!isNew && (
              <>
                <Link to={`/produit/${form.slug}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center rounded border border-ivory-400 px-3 py-2 text-[0.75rem] font-medium text-ink-600 hover:border-ink/40">
                  Voir la fiche
                </Link>
                <Link to={`/admin/intelligence/profit-margin-calculator-shopify`}
                      className="inline-flex items-center gap-1.5 rounded border border-ivory-400 px-3 py-2 text-[0.75rem] font-medium text-ink-600 hover:border-ink/40">
                  <Brain className="h-3.5 w-3.5" aria-hidden /> Analyser
                </Link>
              </>
            )}
            <Button form="product-form" type="submit" loading={save.isPending}>
              Enregistrer
            </Button>
          </div>
        }
      />

      {feedback && <Notice tone="success" className="mb-5">{feedback}</Notice>}
      {saveError && <Notice tone="danger" className="mb-5">{saveError}</Notice>}

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-ivory-300">
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            disabled={isNew && (t === 'variantes' || t === 'visuels')}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2.5 text-[0.8125rem] font-medium transition-colors disabled:opacity-40',
              tab === t ? 'border-ink text-ink' : 'border-transparent text-ink-400 hover:text-ink',
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      <form id="product-form" onSubmit={submit}>
        {tab === 'informations' && (
          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <Card className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom du produit" required className="sm:col-span-2">
                  <Input required value={form.name ?? ''}
                         onChange={(e) => setForm({
                           ...form, name: e.target.value,
                           slug: isNew ? slugify(e.target.value) : form.slug,
                         })} />
                </Field>
                <Field label="Identifiant d'URL" required hint="Utilisé dans l'adresse de la fiche">
                  <Input required value={form.slug ?? ''}
                         onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
                </Field>
                <Field label="Accroche" hint="Une ligne, affichée sous le nom">
                  <Input value={form.subtitle ?? ''}
                         onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
                </Field>
                <Field label="Description" className="sm:col-span-2"
                       hint="150 à 400 mots : matière, coupe, entretien, usage">
                  <Textarea rows={6} value={form.description ?? ''}
                            onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                <Field label="Composition" hint="Ex. : 100 % laine vierge Super 110s">
                  <Textarea rows={2} value={form.composition ?? ''}
                            onChange={(e) => setForm({ ...form, composition: e.target.value })} />
                </Field>
                <Field label="Entretien">
                  <Textarea rows={2} value={form.care_guide ?? ''}
                            onChange={(e) => setForm({ ...form, care_guide: e.target.value })} />
                </Field>
                <Field label="Récit de la pièce" className="sm:col-span-2"
                       hint="Le propos éditorial, affiché en bas de fiche">
                  <Textarea rows={3} value={form.story ?? ''}
                            onChange={(e) => setForm({ ...form, story: e.target.value })} />
                </Field>
              </div>
            </Card>

            <div className="space-y-5">
              <Card className="p-5">
                <p className="mb-4 font-display text-sm text-ink">Mise en ligne</p>
                <div className="space-y-4">
                  <Field label="Statut">
                    <Select value={form.status ?? 'draft'}
                            onChange={(e) => setForm({ ...form, status: e.target.value as Product['status'] })}>
                      <option value="draft">Brouillon — non visible</option>
                      <option value="active">En ligne</option>
                      <option value="archived">Archivé</option>
                    </Select>
                  </Field>
                  <Field label="Catégorie">
                    <Select value={form.category_id ?? ''}
                            onChange={(e) => setForm({ ...form, category_id: e.target.value || null })}>
                      <option value="">Sans catégorie</option>
                      {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                  <Checkbox label="Pièce maîtresse (mise en avant sur l'accueil)"
                            checked={form.is_featured ?? false}
                            onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />
                </div>
              </Card>

              <Card className="p-5">
                <p className="mb-4 font-display text-sm text-ink">Approvisionnement</p>
                <div className="space-y-4">
                  <Field label="Fournisseur">
                    <Select value={form.supplier_id ?? ''}
                            onChange={(e) => setForm({ ...form, supplier_id: e.target.value || null })}>
                      <option value="">Non renseigné</option>
                      {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Délai de réapprovisionnement (jours)"
                         hint="Alimente le calcul du point de commande">
                    <Input type="number" min={0} value={form.lead_time_days ?? 21}
                           onChange={(e) => setForm({ ...form, lead_time_days: Number(e.target.value) })} />
                  </Field>
                  <Field label="Poids (g)" hint="Pour les frais de port et l'international">
                    <Input type="number" min={0} value={form.weight_grams ?? ''}
                           onChange={(e) => setForm({ ...form, weight_grams: e.target.value ? Number(e.target.value) : null })} />
                  </Field>
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === 'prix' && (
          <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
            <Card className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prix de vente TTC (€)" required>
                  <Input type="number" step="0.01" min={0} required value={form.base_price ?? ''}
                         onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })} />
                </Field>
                <Field label="Prix barré (€)" hint="Affiché barré, pour une promotion">
                  <Input type="number" step="0.01" min={0} value={form.compare_at_price ?? ''}
                         onChange={(e) => setForm({ ...form, compare_at_price: e.target.value ? Number(e.target.value) : null })} />
                </Field>

                <div className="sm:col-span-2">
                  <p className="mb-1 mt-2 text-[0.8125rem] font-semibold text-ink">
                    Coûts réels — base de tous les calculs de marge
                  </p>
                  <p className="mb-4 text-[0.75rem] leading-relaxed text-ink-400">
                    Sans ces valeurs, les modules de rentabilité et de pricing ne peuvent
                    rien calculer de fiable. C'est le renseignement le plus utile de cette fiche.
                  </p>
                </div>

                <Field label="Coût d'achat / fabrication (€)" required
                       hint="Prix payé au fournisseur, par unité">
                  <Input type="number" step="0.01" min={0} value={form.cost_price ?? ''}
                         onChange={(e) => setForm({ ...form, cost_price: e.target.value ? Number(e.target.value) : null })} />
                </Field>
                <Field label="Logistique entrante (€)" hint="Acheminement jusqu'à votre stock, par unité">
                  <Input type="number" step="0.01" min={0} value={form.inbound_shipping ?? 0}
                         onChange={(e) => setForm({ ...form, inbound_shipping: Number(e.target.value) })} />
                </Field>
                <Field label="Préparation et emballage (€)">
                  <Input type="number" step="0.01" min={0} value={form.handling_fee ?? 0}
                         onChange={(e) => setForm({ ...form, handling_fee: Number(e.target.value) })} />
                </Field>
                <Field label="Commission de paiement (taux)" hint="0,029 = 2,90 %">
                  <Input type="number" step="0.001" min={0} max={1} value={form.payment_fee_rate ?? 0.029}
                         onChange={(e) => setForm({ ...form, payment_fee_rate: Number(e.target.value) })} />
                </Field>
                <Field label="Commission de paiement (part fixe €)">
                  <Input type="number" step="0.01" min={0} value={form.payment_fee_fixed ?? 0.25}
                         onChange={(e) => setForm({ ...form, payment_fee_fixed: Number(e.target.value) })} />
                </Field>
                <Field label="Part publicitaire visée" hint="0,12 = 12 % du prix consacré à l'acquisition">
                  <Input type="number" step="0.01" min={0} max={1} value={form.ad_spend_ratio ?? 0}
                         onChange={(e) => setForm({ ...form, ad_spend_ratio: Number(e.target.value) })} />
                </Field>
                <Field label="Taux de retour" hint="0,12 = 12 %. En prêt-à-porter, 10 à 20 % est la norme.">
                  <Input type="number" step="0.01" min={0} max={1} value={form.return_rate ?? 0}
                         onChange={(e) => setForm({ ...form, return_rate: Number(e.target.value) })} />
                </Field>
                <Field label="Coût de traitement d'un retour (€)">
                  <Input type="number" step="0.01" min={0} value={form.return_fee ?? 0}
                         onChange={(e) => setForm({ ...form, return_fee: Number(e.target.value) })} />
                </Field>
              </div>
            </Card>

            {/* Marge en direct */}
            <div className="space-y-5">
              <Card>
                <CardHeader title="Marge calculée"
                            subtitle="Moteur profit-margin, en direct" />
                {marginPreview ? (
                  <div className="p-4">
                    <div className="mb-4 rounded bg-ivory-200/60 p-3.5 text-center">
                      <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-400">
                        Marge nette
                      </p>
                      <p className={cn('mt-1 font-display text-3xl font-semibold tabular',
                        marginPreview.netMargin < 0 ? 'text-signal-danger'
                        : marginPreview.netMargin < 0.2 ? 'text-signal-warning' : 'text-signal-success')}>
                        {formatPercent(marginPreview.netMargin)}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] tabular text-ink-500">
                        {formatPrice(marginPreview.netProfit)} par unité
                      </p>
                    </div>

                    <dl className="space-y-1.5 text-[0.75rem]">
                      {[
                        ['CA hors taxes', marginPreview.netRevenue],
                        ["Coût d'achat", -marginPreview.productCost],
                        ['Logistique entrante', -marginPreview.inboundShipping],
                        ['Préparation', -marginPreview.handlingFee],
                        ['Commission paiement', -marginPreview.paymentFee],
                        ['Publicité', -marginPreview.adCost],
                        ['Retours', -marginPreview.returnCost],
                      ].map(([label, value]) => (
                        <div key={label as string} className="flex justify-between">
                          <dt className="text-ink-500">{label}</dt>
                          <dd className="tabular text-ink">{formatPrice(value as number)}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-ivory-300 pt-1.5 font-medium">
                        <dt>Bénéfice net</dt>
                        <dd className="tabular">{formatPrice(marginPreview.netProfit)}</dd>
                      </div>
                      <div className="flex justify-between text-ink-400">
                        <dt>Marge brute</dt>
                        <dd className="tabular">{formatPercent(marginPreview.grossMargin)}</dd>
                      </div>
                    </dl>

                    {!form.cost_price && (
                      <Notice tone="warning" className="mt-4">
                        Coût d'achat non renseigné : cette marge est inexploitable.
                      </Notice>
                    )}
                  </div>
                ) : (
                  <p className="p-5 text-[0.8125rem] text-ink-400">
                    Renseignez un prix de vente pour voir la marge.
                  </p>
                )}
              </Card>

              {pricingGrid.length > 0 && form.cost_price ? (
                <Card>
                  <CardHeader title="Prix conseillés" subtitle="Pour atteindre une marge cible" />
                  <Table>
                    <thead>
                      <tr><Th>Marge visée</Th><Th align="right">Prix</Th><Th align="right">Écart</Th></tr>
                    </thead>
                    <tbody>
                      {pricingGrid.map((g) => (
                        <tr key={g.targetMargin}>
                          <Td>{formatPercent(g.targetMargin, 0)}</Td>
                          <Td align="right">{formatPrice(g.price)}</Td>
                          <Td align="right">
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, base_price: g.price })}
                              className="text-[0.75rem] text-brass-dark hover:underline"
                            >
                              appliquer
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ) : null}
            </div>
          </div>
        )}

        {tab === 'variantes' && !isNew && detail && (
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Variantes"
                subtitle={`${detail.variants.length} variante(s) — tailles et coloris`}
              />
              {detail.variants.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Variante</Th><Th>Référence</Th>
                      <Th align="right">Prix</Th><Th align="right">Coût</Th>
                      <Th align="right">Marge</Th><Th align="right">Stock</Th>
                      <Th align="right">Ajuster</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.variants.map((v) => {
                      const margin = detail.margins.find((m) => m.variant_id === v.id);
                      const health = detail.health.find((h) => h.variant_id === v.id);
                      return (
                        <tr key={v.id}>
                          <Td><span className="font-medium text-ink">{v.title}</span></Td>
                          <Td><span className="font-mono text-[0.75rem]">{v.sku}</span></Td>
                          <Td align="right">
                            {formatPrice(Number(v.price ?? form.base_price ?? 0))}
                          </Td>
                          <Td align="right">
                            {formatPrice(Number(v.cost_price ?? form.cost_price ?? 0))}
                          </Td>
                          <Td align="right">
                            {margin?.net_margin !== null && margin?.net_margin !== undefined ? (
                              <span className={Number(margin.net_margin) < 0.2 ? 'text-signal-warning' : 'text-signal-success'}>
                                {formatPercent(Number(margin.net_margin))}
                              </span>
                            ) : '—'}
                          </Td>
                          <Td align="right">
                            {health ? (
                              health.available <= 0
                                ? <Badge tone="danger">rupture</Badge>
                                : health.needs_restock
                                  ? <span className="text-signal-warning">{health.available}</span>
                                  : health.available
                            ) : '—'}
                          </Td>
                          <Td align="right">
                            <div className="flex items-center justify-end gap-1">
                              {[-1, 1, 10].map((delta) => (
                                <button
                                  key={delta} type="button"
                                  onClick={() => adjustStock.mutate({
                                    variantId: v.id, delta, reason: 'adjustment',
                                    note: 'Ajustement manuel depuis la fiche produit',
                                  })}
                                  className="rounded border border-ivory-400 px-1.5 py-0.5 text-[0.6875rem] text-ink-600 hover:border-ink/40"
                                >
                                  {delta > 0 ? `+${delta}` : delta}
                                </button>
                              ))}
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              ) : (
                <div className="p-5">
                  <Notice tone="info" title="Aucune variante">
                    Ce produit n'a pas de déclinaison. Les variantes (tailles, coloris)
                    se créent par import ou directement en base. Chaque variante porte
                    sa propre référence, son prix éventuel et son stock.
                  </Notice>
                </div>
              )}
            </Card>

            {detail.options.length > 0 && (
              <Card>
                <CardHeader title="Options de déclinaison" />
                <div className="space-y-4 p-5">
                  {detail.options.map((o) => (
                    <div key={o.id}>
                      <p className="text-[0.8125rem] font-medium text-ink">{o.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {o.values.map((v: ProductOptionValue) => (
                          <span key={v.id}
                                className="inline-flex items-center gap-1.5 rounded border border-ivory-400 px-2.5 py-1 text-[0.75rem] text-ink-600">
                            {v.swatch_hex && (
                              <span className="h-3 w-3 rounded-full ring-1 ring-ink/10"
                                    style={{ backgroundColor: v.swatch_hex }} />
                            )}
                            {v.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === 'visuels' && !isNew && detail && (
          <Card>
            <CardHeader
              title="Visuels"
              subtitle="5 à 8 images par fiche : porté, détail matière, dos, accessoirisé"
              action={
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-ivory-400 px-3 py-2 text-[0.75rem] font-medium text-ink-600 hover:border-ink/40">
                  <Upload className="h-3.5 w-3.5" aria-hidden /> Ajouter
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadImage(file);
                    }}
                  />
                </label>
              }
            />
            {detail.images.length ? (
              <div className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
                {detail.images.map((img) => (
                  <div key={img.id} className="group relative">
                    <div className="aspect-[3/4] overflow-hidden rounded bg-ivory-200">
                      <img src={productImageUrl(img.storage_path) ?? ''} alt={img.alt ?? ''}
                           className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <button
                      type="button"
                      aria-label="Supprimer ce visuel"
                      onClick={async () => {
                        await supabase.storage.from('product-images').remove([img.storage_path]);
                        await supabase.from('product_images').delete().eq('id', img.id);
                        void queryClient.invalidateQueries({ queryKey: ['admin', 'product', id] });
                      }}
                      className="absolute right-1.5 top-1.5 rounded bg-white/90 p-1.5 text-signal-danger opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    {!img.alt && (
                      <p className="mt-1.5 text-[0.625rem] text-signal-warning">
                        Texte alternatif manquant
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <Notice tone="warning" title="Aucun visuel">
                  Une fiche sans image ne convertit pas. Ajoutez au moins cinq
                  photographies, et renseignez un texte alternatif pour chacune :
                  c'est à la fois une exigence d'accessibilité et un gain de
                  référencement dans la recherche d'images.
                </Notice>
              </div>
            )}
          </Card>
        )}

        {tab === 'seo' && (
          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <Card className="p-5">
              <div className="space-y-4">
                <Field label="Balise title"
                       hint={`${(form.seo_title ?? '').length} caractères — viser 50 à 70`}>
                  <Input value={form.seo_title ?? ''} maxLength={120}
                         onChange={(e) => setForm({ ...form, seo_title: e.target.value })} />
                </Field>
                <Field label="Méta-description"
                       hint={`${(form.seo_description ?? '').length} caractères — viser 120 à 165`}>
                  <Textarea rows={3} value={form.seo_description ?? ''} maxLength={300}
                            onChange={(e) => setForm({ ...form, seo_description: e.target.value })} />
                </Field>
                <Field label="Mots-clés" hint="Séparés par des virgules. Viser 8 à 13, dont des expressions de deux mots ou plus.">
                  <Textarea rows={2} value={tagsText}
                            onChange={(e) => setTagsText(e.target.value)} />
                </Field>
              </div>
            </Card>

            <Card className="p-5">
              <p className="font-display text-sm text-ink">Aperçu dans les résultats</p>
              <div className="mt-4 rounded border border-ivory-300 bg-white p-3.5">
                <p className="truncate text-[0.6875rem] text-sage">
                  lasappeauthentique.fr › produit › {form.slug}
                </p>
                <p className="mt-1 line-clamp-2 text-[0.875rem] font-medium text-signal-info">
                  {form.seo_title || form.name || 'Titre du produit'}
                </p>
                <p className="mt-1 line-clamp-2 text-[0.75rem] leading-relaxed text-ink-500">
                  {form.seo_description || form.description?.slice(0, 160) || 'Aucune description.'}
                </p>
              </div>
              {!isNew && (
                <Link
                  to="/admin/intelligence/shopify-seo"
                  className="mt-4 inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-brass-dark hover:underline"
                >
                  <Brain className="h-3.5 w-3.5" aria-hidden />
                  Lancer l'audit SEO complet de cette fiche
                </Link>
              )}
            </Card>
          </div>
        )}
      </form>

      {isNew && (
        <Notice tone="info" className="mt-6">
          Enregistrez d'abord le produit : vous pourrez ensuite ajouter ses
          variantes et ses visuels.
        </Notice>
      )}
    </AdminPage>
  );
}
