import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Bell, Boxes, ClipboardCheck, Receipt, TrendingDown,
         TrendingUp, Wallet } from 'lucide-react';
import { useDashboard } from '@/hooks/useAdmin';
import { AdminHeader, AdminPage, StatTile } from '@/components/admin/AdminLayout';
import { Badge, ButtonLink, Card, CardHeader, ErrorBlock, LoadingBlock, Notice,
         Table, Td, Th } from '@/components/ui';
import { ALERT_KIND_LABEL, formatDate, formatPercent, formatPrice,
         formatPriceCompact, formatRelative } from '@/lib/format';

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard(30);

  if (isLoading) return <AdminPage><LoadingBlock label="Chargement du tableau de bord…" /></AdminPage>;
  if (error || !data) {
    return (
      <AdminPage>
        <ErrorBlock
          title="Le tableau de bord n'a pas pu être chargé"
          message={error instanceof Error ? error.message : null}
          onRetry={() => void refetch()}
        />
      </AdminPage>
    );
  }

  const eco = data.economics;
  const revenue = Number(eco?.revenue ?? 0);
  const grossMargin = eco?.gross_margin !== null && eco?.gross_margin !== undefined
    ? Number(eco.gross_margin) : null;
  const aov = Number(eco?.aov ?? 0);
  const orders = Number(eco?.orders ?? 0);

  // Évolution : on compare la première et la seconde moitié de la fenêtre
  const half = Math.floor(data.kpi.length / 2);
  const firstHalf = data.kpi.slice(0, half).reduce((s, k) => s + Number(k.revenue ?? 0), 0);
  const secondHalf = data.kpi.slice(half).reduce((s, k) => s + Number(k.revenue ?? 0), 0);
  const trend = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : null;

  const chartData = data.kpi.map((k) => ({
    jour: new Date(k.day).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
    ca: Number(k.revenue ?? 0),
    marge: Number(k.gross_profit ?? 0),
  }));

  const noSales = orders === 0;

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Pilotage"
        title="Tableau de bord"
        description="Chiffres réels des 30 derniers jours, calculés sur les commandes enregistrées."
        action={
          <ButtonLink to="/admin/intelligence" variant="brass" size="sm">
            Lancer une analyse
          </ButtonLink>
        }
      />

      {/* Actions requises */}
      {(data.pendingApprovals.length > 0 || data.unreadAlerts.length > 0) && (
        <div className="mb-7 grid gap-3 sm:grid-cols-2">
          {data.pendingApprovals.length > 0 && (
            <Link to="/admin/approbations" className="block">
              <Notice tone="warning" title={`${data.pendingApprovals.length} décision(s) en attente`}>
                Des actions sensibles attendent votre approbation : aucune n'a été
                appliquée sans votre accord.
              </Notice>
            </Link>
          )}
          {data.unreadAlerts.length > 0 && (
            <Link to="/admin/alertes" className="block">
              <Notice
                tone={data.unreadAlerts.some((a) => a.severity === 'critical') ? 'danger' : 'info'}
                title={`${data.unreadAlerts.length} alerte(s) ouverte(s)`}
              >
                {data.unreadAlerts.slice(0, 2).map((a) => a.title).join(' · ')}
                {data.unreadAlerts.length > 2 && ` · et ${data.unreadAlerts.length - 2} autre(s)`}
              </Notice>
            </Link>
          )}
        </div>
      )}

      {noSales && (
        <Notice tone="info" className="mb-7" title="Aucune commande sur la période">
          Les indicateurs commerciaux se rempliront dès la première vente. En attendant,
          les modules de marge, de SEO et de stock travaillent déjà sur votre catalogue.
        </Notice>
      )}

      {/* Indicateurs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Chiffre d'affaires (30 j)"
          value={formatPriceCompact(revenue)}
          delta={trend !== null ? `${trend >= 0 ? '+' : ''}${formatPercent(trend)} vs 15 j précédents` : undefined}
          tone={trend === null ? 'neutral' : trend >= 0 ? 'success' : 'danger'}
          icon={trend !== null && trend < 0
            ? <TrendingDown className="h-4 w-4" />
            : <TrendingUp className="h-4 w-4" />}
        />
        <StatTile
          label="Commandes"
          value={String(orders)}
          delta={data.pendingOrders > 0 ? `${data.pendingOrders} à préparer` : undefined}
          icon={<Receipt className="h-4 w-4" />}
        />
        <StatTile
          label="Panier moyen"
          value={formatPrice(aov)}
          hint={eco?.orders_per_customer ? `${eco.orders_per_customer} commande(s) par client` : undefined}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatTile
          label="Marge brute"
          value={grossMargin !== null ? formatPercent(grossMargin) : '—'}
          delta={`objectif net ${formatPercent(data.targetNetMargin, 0)}`}
          tone={grossMargin === null ? 'neutral' : grossMargin >= 0.6 ? 'success' : grossMargin >= 0.45 ? 'warning' : 'danger'}
        />
      </div>

      {/* Courbe */}
      <Card className="mt-6">
        <CardHeader
          title="Chiffre d'affaires et marge"
          subtitle="Évolution quotidienne sur 30 jours"
        />
        <div className="p-4">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0C0C0E" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#0C0C0E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradMarge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C19A3E" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#C19A3E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E7DFD1" vertical={false} />
                <XAxis dataKey="jour" tick={{ fontSize: 11, fill: '#6E6E7E' }}
                       axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#6E6E7E' }} axisLine={false} tickLine={false}
                       tickFormatter={(v) => `${Math.round(Number(v))} €`} width={56} />
                <Tooltip
                  contentStyle={{ borderRadius: 6, border: '1px solid #E7DFD1', fontSize: 12 }}
                  formatter={(v: number, name) => [formatPrice(v), name === 'ca' ? "Chiffre d'affaires" : 'Marge brute']}
                />
                <Area type="monotone" dataKey="ca" stroke="#0C0C0E" strokeWidth={1.75}
                      fill="url(#gradCa)" name="ca" />
                <Area type="monotone" dataKey="marge" stroke="#C19A3E" strokeWidth={1.75}
                      fill="url(#gradMarge)" name="marge" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-14 text-center text-sm text-ink-400">
              Aucune donnée de vente sur la période.
            </p>
          )}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Meilleures ventes */}
        <Card>
          <CardHeader
            title="Meilleures ventes"
            subtitle="Depuis l'ouverture de la boutique"
            action={<Link to="/admin/statistiques" className="link-underline text-[0.75rem] font-medium text-ink">Tout voir</Link>}
          />
          {data.topProducts.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Produit</Th>
                  <Th align="right">Vendus</Th>
                  <Th align="right">CA</Th>
                  <Th align="right">Marge</Th>
                  <Th align="right">Stock</Th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.slice(0, 8).map((p) => (
                  <tr key={p.product_id}>
                    <Td>
                      <Link to={`/admin/produits/${p.product_id}`} className="font-medium text-ink hover:text-brass-dark">
                        {p.name}
                      </Link>
                      {p.category_name && (
                        <span className="block text-[0.6875rem] text-ink-400">{p.category_name}</span>
                      )}
                    </Td>
                    <Td align="right">{p.units_sold}</Td>
                    <Td align="right">{formatPrice(Number(p.revenue))}</Td>
                    <Td align="right">
                      {p.gross_margin !== null ? (
                        <span className={Number(p.gross_margin) < 0.45 ? 'text-signal-warning' : ''}>
                          {formatPercent(Number(p.gross_margin))}
                        </span>
                      ) : '—'}
                    </Td>
                    <Td align="right">
                      {p.stock_available <= 0
                        ? <Badge tone="danger">0</Badge>
                        : p.stock_available}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-ink-400">
              Aucune vente enregistrée pour le moment.
            </p>
          )}
        </Card>

        {/* Stock à réapprovisionner */}
        <Card>
          <CardHeader
            title="Stock à réapprovisionner"
            subtitle={`${data.lowStock.length} référence(s) sous leur seuil`}
            action={<Link to="/admin/stocks" className="link-underline text-[0.75rem] font-medium text-ink">Gérer</Link>}
          />
          {data.lowStock.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Référence</Th>
                  <Th align="right">Dispo.</Th>
                  <Th align="right">Seuil</Th>
                  <Th align="right">Couverture</Th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.slice(0, 8).map((h) => (
                  <tr key={h.variant_id}>
                    <Td>
                      <span className="font-medium text-ink">{h.product_name}</span>
                      <span className="block text-[0.6875rem] text-ink-400">{h.variant_title}</span>
                    </Td>
                    <Td align="right">
                      {h.available <= 0 ? <Badge tone="danger">rupture</Badge> : h.available}
                    </Td>
                    <Td align="right">{h.reorder_point}</Td>
                    <Td align="right">
                      {h.days_of_cover !== null ? `${h.days_of_cover} j` : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="flex items-center gap-2.5 px-5 py-10 text-sm text-signal-success">
              <Boxes className="h-4 w-4" aria-hidden />
              Aucune référence sous son seuil de réapprovisionnement.
            </div>
          )}
        </Card>

        {/* Marges sous l'objectif */}
        <Card>
          <CardHeader
            title="Marges sous l'objectif"
            subtitle={`Objectif de la boutique : ${formatPercent(data.targetNetMargin, 0)} de marge nette`}
            action={
              <Link to="/admin/intelligence?moteur=dynamic-pricing"
                    className="link-underline text-[0.75rem] font-medium text-ink">
                Recommander des prix
              </Link>
            }
          />
          {data.marginsBelowTarget.length ? (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Référence</Th>
                    <Th align="right">Prix</Th>
                    <Th align="right">Marge nette</Th>
                    <Th align="right">Bénéfice</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.marginsBelowTarget.slice(0, 8).map((m) => (
                    <tr key={m.variant_id}>
                      <Td>
                        <span className="font-medium text-ink">{m.product_name}</span>
                        <span className="block text-[0.6875rem] text-ink-400">{m.variant_title}</span>
                      </Td>
                      <Td align="right">{formatPrice(Number(m.price))}</Td>
                      <Td align="right">
                        <span className={Number(m.net_margin) < 0 ? 'text-signal-danger' : 'text-signal-warning'}>
                          {formatPercent(Number(m.net_margin))}
                        </span>
                      </Td>
                      <Td align="right">{formatPrice(Number(m.net_profit))}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {data.marginsBelowTarget.length > 8 && (
                <p className="px-5 py-3 text-[0.75rem] text-ink-400">
                  et {data.marginsBelowTarget.length - 8} autre(s) référence(s).
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2.5 px-5 py-10 text-sm text-signal-success">
              <ClipboardCheck className="h-4 w-4" aria-hidden />
              Toutes les références atteignent l'objectif de marge.
            </div>
          )}
        </Card>

        {/* Alertes */}
        <Card>
          <CardHeader
            title="Alertes récentes"
            action={<Link to="/admin/alertes" className="link-underline text-[0.75rem] font-medium text-ink">Tout voir</Link>}
          />
          {data.unreadAlerts.length ? (
            <ul className="divide-y divide-ivory-200">
              {data.unreadAlerts.slice(0, 7).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      a.severity === 'critical' ? 'text-signal-danger'
                      : a.severity === 'warning' ? 'text-signal-warning' : 'text-signal-info'}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-medium text-ink">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[0.75rem] text-ink-500">{a.message}</p>
                    <p className="mt-1 text-[0.6875rem] text-ink-300">
                      {ALERT_KIND_LABEL[a.kind] ?? a.kind} · {formatRelative(a.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2.5 px-5 py-10 text-sm text-ink-400">
              <Bell className="h-4 w-4" aria-hidden />
              Aucune alerte ouverte.
            </div>
          )}
        </Card>
      </div>

      <p className="mt-8 text-[0.75rem] text-ink-400">
        Catalogue : {data.catalogSize} produit{data.catalogSize > 1 ? 's' : ''} ·
        Données arrêtées au {formatDate(new Date())}
      </p>
    </AdminPage>
  );
}
