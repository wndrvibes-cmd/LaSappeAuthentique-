import { useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useAdminOrders, useUpdateOrder } from '@/hooks/useAdmin';
import { AdminHeader, AdminPage } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock,
         Modal, Notice, Select, Table, Td, Textarea, Th } from '@/components/ui';
import { FULFILLMENT_STATUS_LABEL, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL,
         formatDateTime, formatPercent, formatPrice } from '@/lib/format';
import { downloadCsv } from '@/lib/utils';
import type { Order, OrderItem } from '@/types/database';

type OrderWithItems = Order & { items: OrderItem[] };

function OrderDetail({ order, onClose }: { order: OrderWithItems; onClose: () => void }) {
  const update = useUpdateOrder();
  const [status, setStatus] = useState(order.status);
  const [fulfillment, setFulfillment] = useState(order.fulfillment_status);
  const [tracking, setTracking] = useState(order.tracking_number ?? '');
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url ?? '');
  const [note, setNote] = useState(order.internal_note ?? '');
  const [error, setError] = useState<string | null>(null);

  const shipping = order.shipping_address as Record<string, string> | null;
  const margin = Number(order.total) > 0
    ? (Number(order.total) - Number(order.cogs_total)) / Number(order.total) : null;

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({
        id: order.id,
        status,
        fulfillment_status: fulfillment,
        tracking_number: tracking || null,
        tracking_url: trackingUrl || null,
        internal_note: note || null,
        ...(status === 'shipped' && !order.shipped_at ? { shipped_at: new Date().toISOString() } : {}),
        ...(status === 'delivered' && !order.delivered_at ? { delivered_at: new Date().toISOString() } : {}),
        ...(status === 'cancelled' && !order.cancelled_at ? { cancelled_at: new Date().toISOString() } : {}),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg"
      title={<span className="font-mono">{order.order_number}</span>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button loading={update.isPending} onClick={() => void save()}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-400">Client</p>
            <p className="mt-1 text-[0.875rem] text-ink">{order.email}</p>
            {order.phone && <p className="text-[0.75rem] text-ink-400">{order.phone}</p>}
          </div>
          <div>
            <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-400">Commandée le</p>
            <p className="mt-1 text-[0.875rem] text-ink">
              {formatDateTime(order.placed_at ?? order.created_at)}
            </p>
          </div>
          <div>
            <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-400">Paiement</p>
            <p className="mt-1">
              <Badge tone={order.payment_status === 'paid' ? 'success'
                : order.payment_status === 'failed' ? 'danger' : 'warning'}>
                {PAYMENT_STATUS_LABEL[order.payment_status]}
              </Badge>
            </p>
          </div>
        </div>

        {shipping && (
          <div>
            <p className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-400">
              Adresse de livraison
            </p>
            <address className="text-[0.8125rem] not-italic leading-relaxed text-ink-600">
              {shipping.full_name}<br />
              {shipping.line1}<br />
              {shipping.line2 && <>{shipping.line2}<br /></>}
              {shipping.postal_code} {shipping.city}<br />
              {shipping.country_code}
            </address>
          </div>
        )}

        <div>
          <p className="mb-2 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-400">
            Articles
          </p>
          <Table>
            <thead>
              <tr>
                <Th>Article</Th><Th>Référence</Th><Th align="right">Qté</Th>
                <Th align="right">P.U.</Th><Th align="right">Coût</Th><Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <span className="font-medium text-ink">{i.product_name}</span>
                    <span className="block text-[0.6875rem] text-ink-400">{i.variant_title}</span>
                  </Td>
                  <Td><span className="font-mono text-[0.75rem]">{i.sku}</span></Td>
                  <Td align="right">{i.quantity}</Td>
                  <Td align="right">{formatPrice(Number(i.unit_price), order.currency)}</Td>
                  <Td align="right">{formatPrice(Number(i.unit_cost), order.currency)}</Td>
                  <Td align="right">{formatPrice(Number(i.line_total), order.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <dl className="space-y-1.5 rounded border border-ivory-300 bg-ivory-200/40 p-4 text-[0.8125rem]">
          <div className="flex justify-between"><dt className="text-ink-500">Sous-total</dt>
            <dd className="tabular">{formatPrice(Number(order.subtotal), order.currency)}</dd></div>
          {Number(order.discount_total) > 0 && (
            <div className="flex justify-between text-signal-success">
              <dt>Réduction {order.discount_code ? `(${order.discount_code})` : ''}</dt>
              <dd className="tabular">− {formatPrice(Number(order.discount_total), order.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between"><dt className="text-ink-500">Livraison</dt>
            <dd className="tabular">{formatPrice(Number(order.shipping_total), order.currency)}</dd></div>
          <div className="flex justify-between border-t border-ivory-300 pt-1.5 font-medium">
            <dt>Total</dt><dd className="tabular">{formatPrice(Number(order.total), order.currency)}</dd></div>
          <div className="flex justify-between text-ink-400">
            <dt>Coût des marchandises</dt>
            <dd className="tabular">{formatPrice(Number(order.cogs_total), order.currency)}</dd></div>
          <div className="flex justify-between text-ink-400">
            <dt>Marge brute réalisée</dt>
            <dd className="tabular">
              {formatPrice(Number(order.total) - Number(order.cogs_total), order.currency)}
              {margin !== null && ` (${formatPercent(margin)})`}
            </dd>
          </div>
        </dl>

        {order.customer_note && (
          <Notice tone="info" title="Message du client">{order.customer_note}</Notice>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Statut de la commande">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Order['status'])}>
              {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Expédition">
            <Select value={fulfillment}
                    onChange={(e) => setFulfillment(e.target.value as Order['fulfillment_status'])}>
              {Object.entries(FULFILLMENT_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Numéro de suivi">
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </Field>
          <Field label="Lien de suivi">
            <Input type="url" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
          </Field>
          <Field label="Note interne" className="sm:col-span-2"
                 hint="Visible par l'équipe uniquement, jamais par le client.">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}

export function OrdersPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OrderWithItems | null>(null);
  const { data: orders, isLoading, error, refetch } = useAdminOrders(status, search);

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Ventes"
        title="Commandes"
        description="Le coût des marchandises est figé à la commande : la marge réalisée reste exacte même si les prix d'achat évoluent ensuite."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-ink-400" aria-hidden />
          <Input className="pl-9" placeholder="Numéro de commande ou email…"
                 value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto" value={status ?? ''}
                onChange={(e) => setStatus(e.target.value || null)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {orders?.length ? (
          <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => downloadCsv('commandes', orders.map((o) => ({
              numero: o.order_number, date: o.placed_at ?? o.created_at, email: o.email,
              statut: ORDER_STATUS_LABEL[o.status], paiement: PAYMENT_STATUS_LABEL[o.payment_status],
              sous_total: o.subtotal, reduction: o.discount_total, livraison: o.shipping_total,
              total: o.total, cout_marchandises: o.cogs_total,
              marge: Number(o.total) - Number(o.cogs_total), articles: o.items.length,
            })))}>
            Exporter
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : orders?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Commande</Th><Th>Client</Th><Th>Statut</Th><Th>Paiement</Th>
                <Th align="right">Articles</Th><Th align="right">Total</Th>
                <Th align="right">Marge</Th><Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const m = Number(o.total) > 0
                  ? (Number(o.total) - Number(o.cogs_total)) / Number(o.total) : null;
                return (
                  <tr key={o.id} onClick={() => setSelected(o)}
                      className="cursor-pointer transition-colors hover:bg-ivory-200/40">
                    <Td><span className="font-mono text-[0.8125rem] font-medium text-ink">{o.order_number}</span></Td>
                    <Td><span className="truncate">{o.email}</span></Td>
                    <Td>
                      <Badge tone={
                        o.status === 'delivered' ? 'success'
                        : o.status === 'cancelled' || o.status === 'refunded' ? 'danger'
                        : o.status === 'pending' ? 'warning' : 'info'}>
                        {ORDER_STATUS_LABEL[o.status]}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={o.payment_status === 'paid' ? 'success'
                        : o.payment_status === 'failed' ? 'danger' : 'warning'}>
                        {PAYMENT_STATUS_LABEL[o.payment_status]}
                      </Badge>
                    </Td>
                    <Td align="right">{o.items.reduce((s, i) => s + i.quantity, 0)}</Td>
                    <Td align="right">{formatPrice(Number(o.total), o.currency)}</Td>
                    <Td align="right">
                      {m !== null ? (
                        <span className={m < 0.3 ? 'text-signal-warning' : 'text-signal-success'}>
                          {formatPercent(m)}
                        </span>
                      ) : '—'}
                    </Td>
                    <Td><span className="text-[0.75rem] text-ink-400">
                      {formatDateTime(o.placed_at ?? o.created_at)}
                    </span></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title={search || status ? 'Aucune commande ne correspond' : 'Aucune commande'}
          description={search || status
            ? 'Modifiez la recherche ou le filtre.'
            : 'Les commandes passées sur la boutique apparaîtront ici avec leur marge réalisée.'}
        />
      )}

      {selected && <OrderDetail order={selected} onClose={() => setSelected(null)} />}
    </AdminPage>
  );
}
