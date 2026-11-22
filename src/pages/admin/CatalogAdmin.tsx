/**
 * Pages de gestion du catalogue : catégories, stocks, avis.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Check, Download, Eye, EyeOff, Plus, Star, X } from 'lucide-react';
import { useAdminCategories, useAdjustStock, useAdminReviews, useInventory } from '@/hooks/useAdmin';
import { useQueryClient } from '@tanstack/react-query';
import { AdminHeader, AdminPage, StatTile } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Field, Input,
         LoadingBlock, Modal, Notice, Table, Td, Textarea, Th } from '@/components/ui';
import { formatDate, formatPrice } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { downloadCsv, slugify, cn } from '@/lib/utils';
import type { Category } from '@/types/database';

/* ════════════════════════════ Catégories ══════════════════════════════ */

export function CategoriesPage() {
  const { data: categories, isLoading, error, refetch } = useAdminCategories();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    if (!editing?.name) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      name: editing.name,
      slug: editing.slug || slugify(editing.name),
      description: editing.description ?? null,
      position: editing.position ?? 0,
      is_visible: editing.is_visible ?? true,
      seo_title: editing.seo_title ?? null,
      seo_description: editing.seo_description ?? null,
      parent_id: editing.parent_id ?? null,
    };
    const { error: err } = editing.id
      ? await supabase.from('categories').update(payload).eq('id', editing.id)
      : await supabase.from('categories').insert(payload);
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
  }

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Catalogue"
        title="Catégories"
        description="L'organisation du vestiaire. Une catégorie masquée reste accessible par son adresse directe mais disparaît de la navigation."
        action={
          <Button icon={<Plus className="h-4 w-4" />}
                  onClick={() => setEditing({ is_visible: true, position: (categories?.length ?? 0) + 1 })}>
            Nouvelle catégorie
          </Button>
        }
      />

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : categories?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th align="right">Ordre</Th><Th>Nom</Th><Th>Adresse</Th>
                <Th align="right">Produits</Th><Th>Visible</Th><Th />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-ivory-200/40">
                  <Td align="right"><span className="text-ink-400">{c.position}</span></Td>
                  <Td>
                    <span className="font-medium text-ink">{c.name}</span>
                    {c.description && (
                      <span className="block max-w-md truncate text-[0.6875rem] text-ink-400">
                        {c.description}
                      </span>
                    )}
                  </Td>
                  <Td><span className="font-mono text-[0.75rem] text-ink-400">/categorie/{c.slug}</span></Td>
                  <Td align="right">{c.productCount}</Td>
                  <Td>
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase.from('categories')
                          .update({ is_visible: !c.is_visible }).eq('id', c.id);
                        void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
                        void queryClient.invalidateQueries({ queryKey: ['categories'] });
                      }}
                      className="inline-flex items-center gap-1.5 text-[0.75rem]"
                    >
                      {c.is_visible
                        ? <><Eye className="h-3.5 w-3.5 text-signal-success" aria-hidden /> visible</>
                        : <><EyeOff className="h-3.5 w-3.5 text-ink-300" aria-hidden /> masquée</>}
                    </button>
                  </Td>
                  <Td align="right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Modifier</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title="Aucune catégorie"
          description="Créez les familles de pièces de votre vestiaire : elles structurent la navigation et les filtres."
          action={<Button onClick={() => setEditing({ is_visible: true, position: 1 })}>Créer une catégorie</Button>}
        />
      )}

      {editing && (
        <Modal
          open onClose={() => setEditing(null)}
          title={editing.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
              <Button loading={saving} onClick={() => void save()}>Enregistrer</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nom" required>
              <Input required value={editing.name ?? ''}
                     onChange={(e) => setEditing({
                       ...editing, name: e.target.value,
                       slug: editing.id ? editing.slug : slugify(e.target.value),
                     })} />
            </Field>
            <Field label="Adresse" required>
              <Input required value={editing.slug ?? ''}
                     onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} />
            </Field>
            <Field label="Description" hint="Affichée en tête de la page catégorie">
              <Textarea rows={3} value={editing.description ?? ''}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Catégorie parente">
              <select
                className="h-10 w-full rounded border border-ivory-400 bg-white px-3 text-sm"
                value={editing.parent_id ?? ''}
                onChange={(e) => setEditing({ ...editing, parent_id: e.target.value || null })}
              >
                <option value="">Aucune (niveau principal)</option>
                {categories?.filter((c) => c.id !== editing.id)
                  .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Ordre d'affichage">
              <Input type="number" min={0} value={editing.position ?? 0}
                     onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} />
            </Field>
            <Checkbox label="Visible dans la navigation"
                      checked={editing.is_visible ?? true}
                      onChange={(e) => setEditing({ ...editing, is_visible: e.target.checked })} />
            {saveError && <Notice tone="danger">{saveError}</Notice>}
          </div>
        </Modal>
      )}
    </AdminPage>
  );
}

/* ════════════════════════════════ Stocks ══════════════════════════════ */

export function InventoryPage() {
  const [onlyRestock, setOnlyRestock] = useState(false);
  const { data: inventory, isLoading, error, refetch } = useInventory(onlyRestock);
  const adjust = useAdjustStock();
  const [adjusting, setAdjusting] = useState<{ variantId: string; label: string } | null>(null);
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const totalValue = (inventory ?? []).reduce((s, h) => s + Number(h.stock_value_at_cost), 0);
  const stockouts = (inventory ?? []).filter((h) => h.available <= 0);
  const needRestock = (inventory ?? []).filter((h) => h.needs_restock);
  const dead = (inventory ?? []).filter((h) => h.daily_velocity === 0 && h.on_hand > 0);

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Catalogue"
        title="Stocks"
        description="La couverture en jours est calculée sur les ventes réelles des 30 derniers jours, pas sur une estimation."
        action={
          <Link to="/admin/intelligence/inventory-tracking-software"
                className="inline-flex items-center gap-1.5 rounded bg-brass px-4 py-2 text-[0.8125rem] font-medium text-ink hover:bg-brass-light">
            <Brain className="h-4 w-4" aria-hidden /> Pilotage avancé
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Valeur du stock au coût" value={formatPrice(totalValue)} />
        <StatTile label="Ruptures" value={String(stockouts.length)}
                  tone={stockouts.length ? 'danger' : 'success'} />
        <StatTile label="Sous le seuil" value={String(needRestock.length)}
                  tone={needRestock.length ? 'warning' : 'success'} />
        <StatTile label="Références sans vente (30 j)" value={String(dead.length)}
                  tone={dead.length > (inventory?.length ?? 0) * 0.3 ? 'warning' : 'neutral'} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button size="sm" variant={onlyRestock ? 'primary' : 'secondary'}
                onClick={() => setOnlyRestock(!onlyRestock)}>
          {onlyRestock ? 'Voir tout le stock' : 'Uniquement à réapprovisionner'}
        </Button>
        {inventory?.length ? (
          <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => downloadCsv('stocks', inventory.map((h) => ({
              reference: h.sku, produit: h.product_name, variante: h.variant_title,
              en_stock: h.on_hand, reserve: h.reserved, disponible: h.available,
              seuil: h.reorder_point, ventes_jour: h.daily_velocity,
              couverture_jours: h.days_of_cover ?? '', valeur_cout: h.stock_value_at_cost,
            })))}>
            Exporter
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : inventory?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Référence</Th><Th>Produit</Th>
                <Th align="right">En stock</Th><Th align="right">Réservé</Th>
                <Th align="right">Disponible</Th><Th align="right">Seuil</Th>
                <Th align="right">Ventes / j</Th><Th align="right">Couverture</Th>
                <Th align="right">Valeur</Th><Th />
              </tr>
            </thead>
            <tbody>
              {inventory.map((h) => (
                <tr key={h.variant_id} className={cn(
                  'transition-colors hover:bg-ivory-200/40',
                  h.available <= 0 && 'bg-bordeaux-soft/30',
                )}>
                  <Td><span className="font-mono text-[0.75rem]">{h.sku}</span></Td>
                  <Td>
                    <span className="font-medium text-ink">{h.product_name}</span>
                    <span className="block text-[0.6875rem] text-ink-400">{h.variant_title}</span>
                  </Td>
                  <Td align="right">{h.on_hand}</Td>
                  <Td align="right">{h.reserved || '—'}</Td>
                  <Td align="right">
                    {h.available <= 0
                      ? <Badge tone="danger">rupture</Badge>
                      : h.needs_restock
                        ? <span className="font-medium text-signal-warning">{h.available}</span>
                        : h.available}
                  </Td>
                  <Td align="right"><span className="text-ink-400">{h.reorder_point}</span></Td>
                  <Td align="right">
                    {h.daily_velocity > 0
                      ? h.daily_velocity.toFixed(2)
                      : <span className="text-ink-300">0</span>}
                  </Td>
                  <Td align="right">
                    {h.days_of_cover !== null ? (
                      <span className={h.days_of_cover < 14 ? 'text-signal-warning' : ''}>
                        {h.days_of_cover} j
                      </span>
                    ) : '—'}
                  </Td>
                  <Td align="right">{formatPrice(Number(h.stock_value_at_cost))}</Td>
                  <Td align="right">
                    <Button size="sm" variant="ghost"
                            onClick={() => {
                              setAdjusting({ variantId: h.variant_id,
                                             label: `${h.product_name} — ${h.variant_title}` });
                              setDelta(0); setNote(''); setAdjustError(null);
                            }}>
                      Ajuster
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title={onlyRestock ? 'Aucune référence à réapprovisionner' : 'Aucun stock enregistré'}
          description={onlyRestock
            ? 'Toutes les références sont au-dessus de leur seuil.'
            : 'Les niveaux de stock apparaîtront dès la création de variantes.'}
        />
      )}

      {adjusting && (
        <Modal
          open onClose={() => setAdjusting(null)}
          title="Ajuster le stock"
          footer={
            <>
              <Button variant="ghost" onClick={() => setAdjusting(null)}>Annuler</Button>
              <Button
                loading={adjust.isPending}
                disabled={delta === 0}
                onClick={async () => {
                  setAdjustError(null);
                  try {
                    await adjust.mutateAsync({
                      variantId: adjusting.variantId, delta,
                      reason: delta > 0 ? 'purchase' : 'adjustment',
                      note: note || 'Ajustement manuel',
                    });
                    setAdjusting(null);
                  } catch (e) {
                    setAdjustError(e instanceof Error ? e.message : 'Ajustement impossible');
                  }
                }}
              >
                Appliquer
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-[0.875rem] text-ink-600">{adjusting.label}</p>
            <Field label="Variation" required
                   hint="Positive pour une réception, négative pour une perte ou une correction.">
              <Input type="number" value={delta || ''} autoFocus
                     onChange={(e) => setDelta(Number(e.target.value))} />
            </Field>
            <Field label="Motif" hint="Conservé dans le journal des mouvements.">
              <Input value={note} onChange={(e) => setNote(e.target.value)}
                     placeholder="Réception fournisseur, inventaire, casse…" />
            </Field>
            {adjustError && <Notice tone="danger">{adjustError}</Notice>}
            <Notice tone="info">
              Chaque ajustement est tracé avec son auteur et son motif. Une alerte est
              créée automatiquement si la référence passe sous son seuil.
            </Notice>
          </div>
        </Modal>
      )}
    </AdminPage>
  );
}

/* ═════════════════════════════════ Avis ═══════════════════════════════ */

export function ReviewsPage() {
  const [onlyPending, setOnlyPending] = useState(true);
  const { data: reviews, isLoading, error, refetch } = useAdminReviews(onlyPending);
  const queryClient = useQueryClient();

  async function moderate(id: string, publish: boolean) {
    await supabase.from('product_reviews').update({ is_published: publish }).eq('id', id);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
  }

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Catalogue"
        title="Avis clients"
        description="Les avis déposés arrivent non publiés. Après relecture, ils alimentent la fiche produit et le module d'analyse des avis."
        action={
          <Link to="/admin/intelligence/review-monitoring"
                className="inline-flex items-center gap-1.5 rounded bg-brass px-4 py-2 text-[0.8125rem] font-medium text-ink hover:bg-brass-light">
            <Brain className="h-4 w-4" aria-hidden /> Analyser les avis
          </Link>
        }
      />

      <div className="mb-5">
        <Button size="sm" variant={onlyPending ? 'primary' : 'secondary'}
                onClick={() => setOnlyPending(!onlyPending)}>
          {onlyPending ? 'Voir tous les avis' : 'Uniquement en attente'}
        </Button>
      </div>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : reviews?.length ? (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="flex">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={cn('h-3.5 w-3.5',
                            n <= r.rating ? 'fill-brass text-brass' : 'text-ivory-400')} />
                        ))}
                      </span>
                      <span className="text-[0.8125rem] font-medium text-ink">{r.productName}</span>
                      {r.is_verified && <Badge tone="success">Achat vérifié</Badge>}
                      {r.is_published
                        ? <Badge tone="info">Publié</Badge>
                        : <Badge tone="warning">En attente</Badge>}
                    </div>
                    {r.title && <p className="mt-2 text-[0.875rem] font-semibold text-ink">{r.title}</p>}
                    {r.body && (
                      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-600">{r.body}</p>
                    )}
                    <p className="mt-2 text-[0.6875rem] text-ink-300">
                      {r.author_name} · {formatDate(r.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r.is_published ? (
                      <Button size="sm" variant="secondary" icon={<X className="h-3.5 w-3.5" />}
                              onClick={() => void moderate(r.id, false)}>
                        Dépublier
                      </Button>
                    ) : (
                      <Button size="sm" icon={<Check className="h-3.5 w-3.5" />}
                              onClick={() => void moderate(r.id, true)}>
                        Publier
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={onlyPending ? 'Aucun avis en attente' : 'Aucun avis'}
          description={onlyPending
            ? 'Tous les avis déposés ont été traités.'
            : "Les avis arrivent depuis les fiches produits. Un email après livraison en obtient nettement plus."}
        />
      )}
    </AdminPage>
  );
}
