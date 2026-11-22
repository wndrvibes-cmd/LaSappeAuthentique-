/**
 * Pages de gestion commerciale : clients, promotions, fournisseurs.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Search, ShieldCheck } from 'lucide-react';
import { useAdminCustomers, useAdminDiscounts, useAdminSuppliers,
         useUpdateCustomerRole } from '@/hooks/useAdmin';
import { AdminHeader, AdminPage, StatTile } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Field, Input,
         LoadingBlock, Modal, Notice, Select, Table, Td, Textarea, Th } from '@/components/ui';
import { formatDate, formatPrice } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { downloadCsv } from '@/lib/utils';
import type { Discount, Supplier } from '@/types/database';

/* ════════════════════════════════ Clients ═════════════════════════════ */

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const { data: customers, isLoading, error, refetch } = useAdminCustomers(search);
  const updateRole = useUpdateCustomerRole();

  const withOrders = (customers ?? []).filter((c) => c.orderCount > 0);
  const repeat = withOrders.filter((c) => c.orderCount > 1);
  const totalRevenue = withOrders.reduce((s, c) => s + c.totalSpent, 0);
  const avgSpent = withOrders.length ? totalRevenue / withOrders.length : 0;

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Ventes"
        title="Clients"
        description="Le cumul dépensé exclut les commandes annulées et remboursées."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Comptes" value={String(customers?.length ?? 0)} />
        <StatTile label="Clients ayant commandé" value={String(withOrders.length)} />
        <StatTile label="Clients fidèles" value={String(repeat.length)}
                  hint="Au moins deux commandes"
                  tone={withOrders.length && repeat.length / withOrders.length >= 0.25 ? 'success' : 'warning'} />
        <StatTile label="Dépense moyenne par client" value={formatPrice(avgSpent)} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-ink-400" aria-hidden />
          <Input className="pl-9" placeholder="Nom ou adresse email…"
                 value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {customers?.length ? (
          <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => downloadCsv('clients', customers.map((c) => ({
              nom: c.full_name ?? '', email: c.email, role: c.role,
              commandes: c.orderCount, total_depense: c.totalSpent,
              derniere_commande: c.lastOrderAt ?? '', inscrit_le: c.created_at,
              accepte_marketing: c.accepts_marketing ? 'oui' : 'non',
            })))}>
            Exporter
          </Button>
        ) : null}
      </div>

      <Notice tone="info" className="mb-5">
        L'export contient des données personnelles. Il relève du RGPD : ne le
        conservez pas au-delà du nécessaire et ne le transmettez pas à un tiers
        sans base légale.
      </Notice>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : customers?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Client</Th><Th>Rôle</Th><Th align="right">Commandes</Th>
                <Th align="right">Total dépensé</Th><Th>Dernière commande</Th>
                <Th>Inscrit le</Th><Th>Marketing</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-ivory-200/40">
                  <Td>
                    <span className="font-medium text-ink">{c.full_name || '—'}</span>
                    <span className="block text-[0.6875rem] text-ink-400">{c.email}</span>
                  </Td>
                  <Td>
                    <Select
                      className="h-7 w-auto text-[0.75rem]"
                      value={c.role}
                      aria-label={`Rôle de ${c.email}`}
                      onChange={(e) => updateRole.mutate({
                        id: c.id, role: e.target.value as typeof c.role,
                      })}
                    >
                      <option value="customer">Client</option>
                      <option value="staff">Équipe</option>
                      <option value="admin">Administrateur</option>
                    </Select>
                  </Td>
                  <Td align="right">{c.orderCount || '—'}</Td>
                  <Td align="right">{c.totalSpent > 0 ? formatPrice(c.totalSpent) : '—'}</Td>
                  <Td><span className="text-[0.75rem] text-ink-400">
                    {c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'}
                  </span></Td>
                  <Td><span className="text-[0.75rem] text-ink-400">{formatDate(c.created_at)}</span></Td>
                  <Td>
                    {c.accepts_marketing
                      ? <Badge tone="success">Accepté</Badge>
                      : <span className="text-[0.75rem] text-ink-300">non</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title={search ? 'Aucun client ne correspond' : 'Aucun client'}
          description={search ? 'Modifiez votre recherche.'
            : 'Les comptes créés sur la boutique apparaîtront ici.'}
        />
      )}

      <Notice tone="warning" className="mt-6" title="Attribution des rôles">
        Un compte « administrateur » peut modifier les paramètres de la boutique et
        appliquer les approbations. N'accordez ce rôle qu'aux personnes qui doivent
        réellement décider.
      </Notice>
    </AdminPage>
  );
}

/* ═══════════════════════════════ Promotions ═══════════════════════════ */

const DISCOUNT_TYPE_LABEL: Record<string, string> = {
  percentage: 'Pourcentage', fixed_amount: 'Montant fixe', free_shipping: 'Livraison offerte',
};

export function PromotionsPage() {
  const { data: discounts, isLoading, error, refetch } = useAdminDiscounts();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<Discount> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    if (!editing?.code || !editing.title) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      code: editing.code.toUpperCase().trim(),
      title: editing.title,
      type: editing.type ?? 'percentage',
      value: Number(editing.value ?? 0),
      min_subtotal: Number(editing.min_subtotal ?? 0),
      max_discount: editing.max_discount ? Number(editing.max_discount) : null,
      usage_limit: editing.usage_limit ? Number(editing.usage_limit) : null,
      usage_limit_per_customer: editing.usage_limit_per_customer
        ? Number(editing.usage_limit_per_customer) : null,
      starts_at: editing.starts_at ?? new Date().toISOString(),
      ends_at: editing.ends_at || null,
      is_active: editing.is_active ?? true,
    };
    const { error: err } = editing.id
      ? await supabase.from('discounts').update(payload).eq('id', editing.id)
      : await supabase.from('discounts').insert(payload);
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'discounts'] });
  }

  const active = (discounts ?? []).filter((d) =>
    d.is_active && new Date(d.starts_at) <= new Date() &&
    (!d.ends_at || new Date(d.ends_at) > new Date()));

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Ventes"
        title="Codes de réduction"
        description="Les codes ne sont jamais listés publiquement : leur validation passe par une fonction serveur qui vérifie les conditions sans exposer le catalogue des codes."
        action={
          <Button icon={<Plus className="h-4 w-4" />}
                  onClick={() => setEditing({ type: 'percentage', is_active: true, value: 10, min_subtotal: 0 })}>
            Nouveau code
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Codes enregistrés" value={String(discounts?.length ?? 0)} />
        <StatTile label="Codes actifs" value={String(active.length)} tone="success" />
        <StatTile label="Utilisations totales"
                  value={String((discounts ?? []).reduce((s, d) => s + d.used_count, 0))} />
      </div>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : discounts?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th><Th>Intitulé</Th><Th>Type</Th>
                <Th align="right">Valeur</Th><Th align="right">Minimum</Th>
                <Th align="right">Utilisations</Th><Th>Période</Th><Th>État</Th><Th />
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => {
                const expired = d.ends_at && new Date(d.ends_at) < new Date();
                const exhausted = d.usage_limit !== null && d.used_count >= d.usage_limit;
                return (
                  <tr key={d.id} className="transition-colors hover:bg-ivory-200/40">
                    <Td><span className="font-mono text-[0.8125rem] font-semibold text-ink">{d.code}</span></Td>
                    <Td>{d.title}</Td>
                    <Td><span className="text-[0.75rem]">{DISCOUNT_TYPE_LABEL[d.type]}</span></Td>
                    <Td align="right">
                      {d.type === 'percentage' ? `${Number(d.value)} %`
                        : d.type === 'fixed_amount' ? formatPrice(Number(d.value)) : '—'}
                    </Td>
                    <Td align="right">
                      {Number(d.min_subtotal) > 0 ? formatPrice(Number(d.min_subtotal)) : '—'}
                    </Td>
                    <Td align="right">
                      {d.used_count}{d.usage_limit !== null && ` / ${d.usage_limit}`}
                    </Td>
                    <Td><span className="text-[0.75rem] text-ink-400">
                      {formatDate(d.starts_at)}{d.ends_at && ` → ${formatDate(d.ends_at)}`}
                    </span></Td>
                    <Td>
                      {!d.is_active ? <Badge tone="neutral">Désactivé</Badge>
                        : expired ? <Badge tone="neutral">Expiré</Badge>
                        : exhausted ? <Badge tone="warning">Épuisé</Badge>
                        : <Badge tone="success">Actif</Badge>}
                    </Td>
                    <Td align="right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Modifier</Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title="Aucun code de réduction"
          description="Créez un code de bienvenue pour la première commande, ou une opération limitée dans le temps."
          action={<Button onClick={() => setEditing({ type: 'percentage', is_active: true, value: 10 })}>
            Créer un code
          </Button>}
        />
      )}

      {editing && (
        <Modal
          open onClose={() => setEditing(null)}
          title={editing.id ? 'Modifier le code' : 'Nouveau code de réduction'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
              <Button loading={saving} onClick={() => void save()}>Enregistrer</Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" required hint="En majuscules, sans espace">
              <Input required value={editing.code ?? ''}
                     onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase().replace(/\s/g, '') })} />
            </Field>
            <Field label="Intitulé" required hint="Visible dans l'administration">
              <Input required value={editing.title ?? ''}
                     onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label="Type" required>
              <Select value={editing.type ?? 'percentage'}
                      onChange={(e) => setEditing({ ...editing, type: e.target.value as Discount['type'] })}>
                <option value="percentage">Pourcentage de remise</option>
                <option value="fixed_amount">Montant fixe en euros</option>
                <option value="free_shipping">Livraison offerte</option>
              </Select>
            </Field>
            <Field label={editing.type === 'percentage' ? 'Pourcentage' : 'Montant (€)'}
                   required={editing.type !== 'free_shipping'}>
              <Input type="number" step="0.01" min={0}
                     max={editing.type === 'percentage' ? 100 : undefined}
                     disabled={editing.type === 'free_shipping'}
                     value={editing.value ?? ''}
                     onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} />
            </Field>
            <Field label="Montant minimum d'achat (€)">
              <Input type="number" step="0.01" min={0} value={editing.min_subtotal ?? 0}
                     onChange={(e) => setEditing({ ...editing, min_subtotal: Number(e.target.value) })} />
            </Field>
            <Field label="Plafond de remise (€)" hint="Facultatif : limite la remise en valeur">
              <Input type="number" step="0.01" min={0} value={editing.max_discount ?? ''}
                     onChange={(e) => setEditing({ ...editing, max_discount: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Nombre total d'utilisations" hint="Vide = illimité">
              <Input type="number" min={1} value={editing.usage_limit ?? ''}
                     onChange={(e) => setEditing({ ...editing, usage_limit: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Utilisations par client" hint="Vide = illimité">
              <Input type="number" min={1} value={editing.usage_limit_per_customer ?? ''}
                     onChange={(e) => setEditing({ ...editing, usage_limit_per_customer: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Date de fin" hint="Vide = sans limite" className="sm:col-span-2">
              <Input type="datetime-local"
                     value={editing.ends_at ? editing.ends_at.slice(0, 16) : ''}
                     onChange={(e) => setEditing({
                       ...editing,
                       ends_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                     })} />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox label="Code actif"
                        checked={editing.is_active ?? true}
                        onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
            </div>
            {saveError && <div className="sm:col-span-2"><Notice tone="danger">{saveError}</Notice></div>}
          </div>
        </Modal>
      )}
    </AdminPage>
  );
}

/* ══════════════════════════════ Fournisseurs ══════════════════════════ */

export function SuppliersPage() {
  const { data: suppliers, isLoading, error, refetch } = useAdminSuppliers();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    if (!editing?.name) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      name: editing.name,
      contact_name: editing.contact_name ?? null,
      email: editing.email ?? null,
      phone: editing.phone ?? null,
      country_code: editing.country_code ?? null,
      website: editing.website ?? null,
      lead_time_days: Number(editing.lead_time_days ?? 21),
      production_days: Number(editing.production_days ?? 14),
      shipping_days: Number(editing.shipping_days ?? 7),
      payment_terms_days: Number(editing.payment_terms_days ?? 0),
      min_order_quantity: Number(editing.min_order_quantity ?? 1),
      min_order_value: Number(editing.min_order_value ?? 0),
      reliability_score: editing.reliability_score ? Number(editing.reliability_score) : null,
      notes: editing.notes ?? null,
      is_active: editing.is_active ?? true,
    };
    const { error: err } = editing.id
      ? await supabase.from('suppliers').update(payload).eq('id', editing.id)
      : await supabase.from('suppliers').insert(payload);
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
  }

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Ventes"
        title="Fournisseurs"
        description="Les délais et conditions de paiement renseignés ici alimentent directement le calcul du cycle de trésorerie et du point de commande."
        action={
          <Button icon={<Plus className="h-4 w-4" />}
                  onClick={() => setEditing({ is_active: true, lead_time_days: 21,
                    production_days: 14, shipping_days: 7, payment_terms_days: 0,
                    min_order_quantity: 1, min_order_value: 0 })}>
            Nouveau fournisseur
          </Button>
        }
      />

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : suppliers?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Fournisseur</Th><Th>Pays</Th><Th align="right">Produits</Th>
                <Th align="right">Délai total</Th><Th align="right">Paiement</Th>
                <Th align="right">Minimum</Th><Th align="right">Fiabilité</Th><Th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-ivory-200/40">
                  <Td>
                    <span className="font-medium text-ink">{s.name}</span>
                    {s.email && <span className="block text-[0.6875rem] text-ink-400">{s.email}</span>}
                    {!s.is_active && <Badge tone="neutral" className="mt-1">Inactif</Badge>}
                  </Td>
                  <Td>{s.country_code ?? '—'}</Td>
                  <Td align="right">{s.productCount}</Td>
                  <Td align="right">
                    {s.production_days + s.shipping_days} j
                    <span className="block text-[0.625rem] text-ink-400">
                      {s.production_days} + {s.shipping_days}
                    </span>
                  </Td>
                  <Td align="right">
                    {s.payment_terms_days > 0
                      ? <span className="text-signal-success">{s.payment_terms_days} j</span>
                      : <span className="text-signal-warning">comptant</span>}
                  </Td>
                  <Td align="right">
                    {s.min_order_quantity} u
                    {Number(s.min_order_value) > 0 && (
                      <span className="block text-[0.625rem] text-ink-400">
                        {formatPrice(Number(s.min_order_value))}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    {s.reliability_score !== null ? (
                      <span className={s.reliability_score >= 80 ? 'text-signal-success'
                        : s.reliability_score >= 60 ? 'text-signal-warning' : 'text-signal-danger'}>
                        {s.reliability_score}/100
                      </span>
                    ) : '—'}
                  </Td>
                  <Td align="right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Modifier</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title="Aucun fournisseur"
          description="Renseignez vos fournisseurs et leurs conditions : c'est ce qui permet au module de chaîne d'approvisionnement de calculer votre cycle de trésorerie."
          action={<Button onClick={() => setEditing({ is_active: true, lead_time_days: 21 })}>
            Ajouter un fournisseur
          </Button>}
        />
      )}

      {editing && (
        <Modal
          open onClose={() => setEditing(null)} size="lg"
          title={editing.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
              <Button loading={saving} onClick={() => void save()}>Enregistrer</Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom" required className="sm:col-span-2">
              <Input required value={editing.name ?? ''}
                     onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Contact"><Input value={editing.contact_name ?? ''}
              onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={editing.email ?? ''}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="Téléphone"><Input type="tel" value={editing.phone ?? ''}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label="Pays" hint="Code à deux lettres">
              <Input maxLength={2} value={editing.country_code ?? ''}
                     onChange={(e) => setEditing({ ...editing, country_code: e.target.value.toUpperCase() })} />
            </Field>

            <div className="sm:col-span-2">
              <p className="mb-1 mt-2 text-[0.8125rem] font-semibold text-ink">
                Conditions — utilisées par les calculs de trésorerie
              </p>
            </div>
            <Field label="Durée de production (jours)">
              <Input type="number" min={0} value={editing.production_days ?? 14}
                     onChange={(e) => setEditing({ ...editing, production_days: Number(e.target.value) })} />
            </Field>
            <Field label="Durée de transport (jours)">
              <Input type="number" min={0} value={editing.shipping_days ?? 7}
                     onChange={(e) => setEditing({ ...editing, shipping_days: Number(e.target.value) })} />
            </Field>
            <Field label="Délai de paiement obtenu (jours)"
                   hint="Le levier le moins coûteux sur votre trésorerie">
              <Input type="number" min={0} value={editing.payment_terms_days ?? 0}
                     onChange={(e) => setEditing({ ...editing, payment_terms_days: Number(e.target.value) })} />
            </Field>
            <Field label="Quantité minimale de commande">
              <Input type="number" min={1} value={editing.min_order_quantity ?? 1}
                     onChange={(e) => setEditing({ ...editing, min_order_quantity: Number(e.target.value) })} />
            </Field>
            <Field label="Montant minimum de commande (€)">
              <Input type="number" step="0.01" min={0} value={editing.min_order_value ?? 0}
                     onChange={(e) => setEditing({ ...editing, min_order_value: Number(e.target.value) })} />
            </Field>
            <Field label="Fiabilité observée (0–100)" hint="Votre appréciation : respect des délais et de la qualité">
              <Input type="number" min={0} max={100} value={editing.reliability_score ?? ''}
                     onChange={(e) => setEditing({ ...editing, reliability_score: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea rows={2} value={editing.notes ?? ''}
                        onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox label="Fournisseur actif" checked={editing.is_active ?? true}
                        onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
            </div>
            {saveError && <div className="sm:col-span-2"><Notice tone="danger">{saveError}</Notice></div>}
          </div>
        </Modal>
      )}

      <Notice tone="info" className="mt-6" title="Pourquoi ces champs comptent">
        <ShieldCheck className="mb-1 inline h-3.5 w-3.5" aria-hidden /> Le délai de
        paiement et les durées de production et de transport déterminent votre cycle
        de trésorerie : c'est le nombre de jours pendant lesquels votre argent est
        immobilisé avant de revenir. Le module de chaîne d'approvisionnement le
        calcule à partir de ces valeurs.
      </Notice>
    </AdminPage>
  );
}
