import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
         ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Brain, Download } from 'lucide-react';
import { useDashboard } from '@/hooks/useAdmin';
import { AdminHeader, AdminPage, StatTile } from '@/components/admin/AdminLayout';
import { Button, Card, CardHeader, ErrorBlock, LoadingBlock, Notice, Select,
         Table, Td, Th } from '@/components/ui';
import { formatPercent, formatPrice, formatPriceCompact } from '@/lib/format';
import { downloadCsv } from '@/lib/utils';

/* Palette cohérente avec l'identité : encre, laiton, bordeaux, sauge. */
const SERIES = ['#0C0C0E', '#C19A3E', '#6E1F30', '#3F6B52', '#6E6E7E'];

export function AnalyticsPage() {
  const [windowDays, setWindowDays] = useState(90);
  const { data, isLoading, error, refetch } = useDashboard(windowDays);

  if (isLoading) return <AdminPage><LoadingBlock /></AdminPage>;
  if (error || !data) {
    return (
      <AdminPage>
        <ErrorBlock message={error instanceof Error ? error.message : null}
                    onRetry={() => void refetch()} />
      </AdminPage>
    );
  }

  const eco = data.economics;
  const revenue = Number(eco?.revenue ?? 0);
  const cogs = Number(eco?.cogs ?? 0);
  const grossProfit = revenue - cogs;

  const dailyData = data.kpi.map((k) => ({
    jour: new Date(k.day).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
    ca: Number(k.revenue ?? 0),
    commandes: Number(k.orders ?? 0),
    panier: Number(k.average_order_value ?? 0),
    marge: Number(k.gross_profit ?? 0),
  }));

  // Répartition du chiffre d'affaires par produit (loi de Pareto)
  const topRevenue = data.topProducts.slice(0, 6).map((p, i) => ({
    name: p.name.length > 22 ? `${p.name.slice(0, 22)}…` : p.name,
    value: Number(p.revenue),
    fill: SERIES[i % SERIES.length],
  }));
  const totalTop = topRevenue.reduce((s, p) => s + p.value, 0);
  const others = Math.max(revenue - totalTop, 0);
  if (others > 0) topRevenue.push({ name: 'Autres', value: others, fill: '#D6CAB6' });

  const marginData = data.topProducts
    .filter((p) => p.gross_margin !== null && Number(p.revenue) > 0)
    .slice(0, 10)
    .map((p) => ({
      name: p.name.length > 18 ? `${p.name.slice(0, 18)}…` : p.name,
      marge: Math.round(Number(p.gross_margin) * 1000) / 10,
      ca: Number(p.revenue),
    }));

  const noData = revenue === 0;

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Pilotage"
        title="Statistiques commerciales"
        description="Chiffres calculés sur les commandes réellement enregistrées, hors annulations et remboursements."
        action={
          <div className="flex gap-2">
            <Select className="w-auto" value={String(windowDays)}
                    onChange={(e) => setWindowDays(Number(e.target.value))}
                    aria-label="Période d'analyse">
              <option value="30">30 jours</option>
              <option value="90">90 jours</option>
              <option value="180">6 mois</option>
              <option value="365">1 an</option>
            </Select>
            <Link to="/admin/intelligence/sales-tracking-tool"
                  className="inline-flex items-center gap-1.5 rounded bg-brass px-4 py-2 text-[0.8125rem] font-medium text-ink hover:bg-brass-light">
              <Brain className="h-4 w-4" aria-hidden /> Analyse approfondie
            </Link>
          </div>
        }
      />

      {noData && (
        <Notice tone="info" className="mb-6" title="Aucune vente sur la période">
          Les statistiques se construiront avec les premières commandes. Les modules
          de marge, de SEO et de stock sont déjà exploitables sans historique de vente.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`Chiffre d'affaires (${windowDays} j)`} value={formatPriceCompact(revenue)} />
        <StatTile label="Marge brute" value={formatPriceCompact(grossProfit)}
                  delta={revenue > 0 ? formatPercent(grossProfit / revenue) : undefined}
                  tone={revenue > 0 && grossProfit / revenue >= 0.6 ? 'success'
                    : revenue > 0 && grossProfit / revenue >= 0.45 ? 'warning' : 'neutral'} />
        <StatTile label="Commandes" value={String(eco?.orders ?? 0)}
                  delta={eco?.orders_per_customer ? `${eco.orders_per_customer} par client` : undefined} />
        <StatTile label="Taux de réachat"
                  value={eco?.repeat_rate !== null && eco?.repeat_rate !== undefined
                    ? formatPercent(Number(eco.repeat_rate)) : '—'}
                  hint={`${eco?.repeat_customers ?? 0} client(s) fidèle(s)`}
                  tone={eco?.repeat_rate && Number(eco.repeat_rate) >= 0.25 ? 'success' : 'warning'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Chiffre d'affaires et commandes" subtitle="Évolution quotidienne" />
          <div className="p-4">
            {dailyData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E7DFD1" vertical={false} />
                  <XAxis dataKey="jour" tick={{ fontSize: 11, fill: '#6E6E7E' }}
                         axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6E6E7E' }}
                         axisLine={false} tickLine={false} width={56}
                         tickFormatter={(v) => `${Math.round(Number(v))} €`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6E6E7E' }}
                         axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #E7DFD1', fontSize: 12 }}
                           formatter={(v: number, name) => [
                             name === 'commandes' ? v : formatPrice(v),
                             name === 'ca' ? "Chiffre d'affaires" : name === 'marge' ? 'Marge brute' : 'Commandes',
                           ]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="ca" stroke="#0C0C0E"
                        strokeWidth={1.75} dot={false} name="ca" />
                  <Line yAxisId="left" type="monotone" dataKey="marge" stroke="#C19A3E"
                        strokeWidth={1.75} dot={false} name="marge" />
                  <Line yAxisId="right" type="monotone" dataKey="commandes" stroke="#3F6B52"
                        strokeWidth={1.25} strokeDasharray="4 3" dot={false} name="commandes" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-ink-400">Aucune donnée sur la période.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Répartition du chiffre d'affaires"
                      subtitle="Concentration par produit" />
          <div className="p-4">
            {topRevenue.length && revenue > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={topRevenue} dataKey="value" nameKey="name"
                       cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {topRevenue.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #E7DFD1', fontSize: 12 }}
                           formatter={(v: number) => formatPrice(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-ink-400">Aucune vente à répartir.</p>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Marge brute par produit"
                      subtitle="Les dix premiers par chiffre d'affaires" />
          <div className="p-4">
            {marginData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={marginData} margin={{ top: 8, right: 8, left: 0, bottom: 56 }}>
                  <CartesianGrid stroke="#E7DFD1" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6E6E7E' }}
                         axisLine={false} tickLine={false} angle={-35} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: '#6E6E7E' }} axisLine={false} tickLine={false}
                         width={40} tickFormatter={(v) => `${v} %`} />
                  <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #E7DFD1', fontSize: 12 }}
                           formatter={(v: number) => [`${v} %`, 'Marge brute']} />
                  <Bar dataKey="marge" radius={[3, 3, 0, 0]}>
                    {marginData.map((d, i) => (
                      <Cell key={i} fill={d.marge < 45 ? '#A8322C' : d.marge < 60 ? '#B9801F' : '#3F6B52'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-ink-400">
                Aucune marge calculable : renseignez les coûts d'achat de vos produits.
              </p>
            )}
            <p className="mt-2 text-[0.6875rem] text-ink-400">
              Seuil de référence DTC du dépôt Nexscope : 60 % de marge brute pour
              absorber l'acquisition. En rouge, sous 45 %.
            </p>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Performance détaillée par produit"
          action={
            data.topProducts.length ? (
              <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />}
                onClick={() => downloadCsv('performance-produits', data.topProducts.map((p) => ({
                  produit: p.name, categorie: p.category_name ?? '',
                  unites_vendues: p.units_sold, chiffre_affaires: p.revenue,
                  cout_marchandises: p.cogs, marge_brute: p.gross_profit,
                  taux_marge: p.gross_margin ?? '', commandes: p.order_count,
                  stock_disponible: p.stock_available, note_moyenne: p.average_rating ?? '',
                  nombre_avis: p.review_count,
                })))}>
                Exporter
              </Button>
            ) : undefined
          }
        />
        {data.topProducts.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Produit</Th><Th>Catégorie</Th>
                <Th align="right">Unités</Th><Th align="right">CA</Th>
                <Th align="right">Coût</Th><Th align="right">Marge</Th>
                <Th align="right">Taux</Th><Th align="right">Commandes</Th>
                <Th align="right">Stock</Th><Th align="right">Note</Th>
              </tr>
            </thead>
            <tbody>
              {data.topProducts.map((p) => (
                <tr key={p.product_id}>
                  <Td>
                    <Link to={`/admin/produits/${p.product_id}`}
                          className="font-medium text-ink hover:text-brass-dark">{p.name}</Link>
                  </Td>
                  <Td><span className="text-[0.75rem] text-ink-400">{p.category_name ?? '—'}</span></Td>
                  <Td align="right">{p.units_sold}</Td>
                  <Td align="right">{formatPrice(Number(p.revenue))}</Td>
                  <Td align="right">{formatPrice(Number(p.cogs))}</Td>
                  <Td align="right">{formatPrice(Number(p.gross_profit))}</Td>
                  <Td align="right">
                    {p.gross_margin !== null ? (
                      <span className={Number(p.gross_margin) < 0.45 ? 'text-signal-warning' : 'text-signal-success'}>
                        {formatPercent(Number(p.gross_margin))}
                      </span>
                    ) : '—'}
                  </Td>
                  <Td align="right">{p.order_count}</Td>
                  <Td align="right">{p.stock_available}</Td>
                  <Td align="right">
                    {p.average_rating !== null
                      ? `${Number(p.average_rating).toFixed(1)} (${p.review_count})`
                      : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-ink-400">
            Aucune vente enregistrée sur la période.
          </p>
        )}
      </Card>

      <Notice tone="info" className="mt-6">
        Pour aller plus loin — tendance période sur période, produits en accélération
        ou en décrochage, concentration du chiffre d'affaires et détection
        d'anomalies —{' '}
        <Link to="/admin/intelligence/sales-tracking-tool" className="link-underline font-medium">
          lancez le module d'analyse des ventes
        </Link>.
      </Notice>
    </AdminPage>
  );
}
