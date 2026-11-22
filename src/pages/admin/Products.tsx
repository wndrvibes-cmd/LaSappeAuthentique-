import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Download, Plus, Search } from 'lucide-react';
import { useAdminProducts } from '@/hooks/useAdmin';
import { AdminHeader, AdminPage } from '@/components/admin/AdminLayout';
import { Badge, ButtonLink, Button, Card, EmptyState, ErrorBlock, Input,
         LoadingBlock, Select, Table, Td, Th } from '@/components/ui';
import { PRODUCT_STATUS_LABEL, formatPercent, formatPrice } from '@/lib/format';
import { productImageUrl } from '@/lib/supabase';
import { downloadCsv } from '@/lib/utils';

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const { data: products, isLoading, error, refetch } = useAdminProducts(search, status);

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Catalogue"
        title="Produits"
        description="Les marges affichées sont calculées sur les coûts réels renseignés : coût d'achat, logistique, préparation, commission de paiement, publicité et retours."
        action={
          <ButtonLink to="/admin/produits/nouveau" icon={<Plus className="h-4 w-4" />}>
            Nouveau produit
          </ButtonLink>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-ink-400" aria-hidden />
          <Input className="pl-9" placeholder="Rechercher un produit…"
                 value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto" value={status ?? ''}
                onChange={(e) => setStatus(e.target.value || null)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          <option value="active">En ligne</option>
          <option value="draft">Brouillon</option>
          <option value="archived">Archivé</option>
        </Select>
        {products?.length ? (
          <Button
            variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => downloadCsv('produits', products.map((p) => ({
              nom: p.name, slug: p.slug, statut: PRODUCT_STATUS_LABEL[p.status],
              categorie: p.categoryName ?? '', prix: p.base_price,
              cout: p.cost_price ?? '', marge_nette: p.netMargin ?? '',
              variantes: p.variantCount, stock: p.stockAvailable,
              vendus: p.unitsSold, chiffre_affaires: p.revenue,
            })))}
          >
            Exporter
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : products?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th>Statut</Th>
                <Th align="right">Prix</Th>
                <Th align="right">Coût</Th>
                <Th align="right">Marge nette</Th>
                <Th align="right">Variantes</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Vendus</Th>
                <Th align="right">CA</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-ivory-200/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-9 shrink-0 overflow-hidden rounded bg-ivory-200">
                        {productImageUrl(p.imagePath) ? (
                          <img src={productImageUrl(p.imagePath)!} alt="" aria-hidden
                               className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[0.75rem] text-ink-300">
                            {p.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link to={`/admin/produits/${p.id}`}
                              className="block truncate font-medium text-ink hover:text-brass-dark">
                          {p.name}
                        </Link>
                        <span className="text-[0.6875rem] text-ink-400">
                          {p.categoryName ?? 'sans catégorie'}
                        </span>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={p.status === 'active' ? 'success' : p.status === 'draft' ? 'warning' : 'neutral'}>
                      {PRODUCT_STATUS_LABEL[p.status]}
                    </Badge>
                  </Td>
                  <Td align="right">{formatPrice(Number(p.base_price), p.currency)}</Td>
                  <Td align="right">
                    {p.cost_price !== null ? formatPrice(Number(p.cost_price), p.currency)
                      : <span className="text-signal-warning">à saisir</span>}
                  </Td>
                  <Td align="right">
                    {p.netMargin !== null ? (
                      <span className={
                        p.netMargin < 0 ? 'text-signal-danger font-medium'
                        : p.netMargin < 0.2 ? 'text-signal-warning' : 'text-signal-success'}>
                        {formatPercent(p.netMargin)}
                      </span>
                    ) : '—'}
                  </Td>
                  <Td align="right">{p.variantCount}</Td>
                  <Td align="right">
                    {p.stockAvailable <= 0
                      ? <Badge tone="danger">0</Badge>
                      : p.stockAvailable < 10
                        ? <span className="text-signal-warning">{p.stockAvailable}</span>
                        : p.stockAvailable}
                  </Td>
                  <Td align="right">{p.unitsSold}</Td>
                  <Td align="right">{formatPrice(p.revenue, p.currency)}</Td>
                  <Td align="right">
                    <Link
                      to={`/admin/intelligence/profit-margin-calculator-shopify?produit=${p.id}`}
                      title="Analyser la rentabilité"
                      className="inline-flex rounded p-1.5 text-ink-400 transition-colors hover:bg-ivory-300 hover:text-ink"
                    >
                      <Brain className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title={search || status ? 'Aucun produit ne correspond' : 'Aucun produit'}
          description={search || status
            ? 'Modifiez la recherche ou le filtre de statut.'
            : "Créez votre premier produit. Renseignez son coût d'achat dès le départ : c'est ce qui permet aux modules de calculer vos marges réelles."}
          action={<ButtonLink to="/admin/produits/nouveau">Créer un produit</ButtonLink>}
        />
      )}
    </AdminPage>
  );
}
