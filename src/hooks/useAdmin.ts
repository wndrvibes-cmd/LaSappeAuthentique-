/**
 * Accès aux données du back-office.
 * Toutes les requêtes sont filtrées par les politiques RLS : un compte sans
 * rôle « staff » ne reçoit rien, même si l'interface était atteinte.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { groupBy } from '@/hooks/useShop';
import type {
  Alert, ApprovalRequest, Automation, AutomationRun, Category, Competitor,
  CompetitorProduct, Discount, InventoryHealth, KpiDaily, NexscopeSkill, Order,
  OrderItem, PriceHistoryRow, Product, ProductOpportunity, ProductOptionValue,
  ProductPerformance, ProductReview, ProductVariant, Profile, ShopSettings,
  SkillRun, StoreUnitEconomics,
  Supplier, VariantMargin,
} from '@/types/database';

const DAY = 86_400_000;
const iso = (d: number) => new Date(Date.now() - d * DAY).toISOString();

/* ──────────────────────────── Tableau de bord ──────────────────────────── */

export interface DashboardData {
  economics: StoreUnitEconomics | null;
  kpi: KpiDaily[];
  topProducts: ProductPerformance[];
  lowStock: InventoryHealth[];
  pendingOrders: number;
  unreadAlerts: Alert[];
  pendingApprovals: ApprovalRequest[];
  marginsBelowTarget: VariantMargin[];
  targetNetMargin: number;
  catalogSize: number;
}

export function useDashboard(windowDays = 30) {
  return useQuery({
    queryKey: ['admin', 'dashboard', windowDays],
    queryFn: async (): Promise<DashboardData> => {
      const [eco, kpi, perf, health, pending, alerts, approvals, settings, margins, catalog] =
        await Promise.all([
          supabase.rpc('store_unit_economics', { p_days: windowDays }),
          supabase.from('kpi_daily').select('*')
            .gte('day', iso(windowDays).slice(0, 10)).order('day'),
          supabase.from('product_performance').select('*')
            .order('revenue', { ascending: false }).limit(10),
          supabase.from('inventory_health').select('*')
            .eq('needs_restock', true).order('available').limit(25),
          supabase.from('orders').select('id', { count: 'exact', head: true })
            .in('status', ['paid', 'processing']),
          supabase.from('alerts').select('*').eq('is_resolved', false)
            .order('created_at', { ascending: false }).limit(20),
          supabase.from('approval_requests').select('*').eq('status', 'pending')
            .order('created_at', { ascending: false }).limit(10),
          supabase.from('shop_settings').select('target_net_margin').maybeSingle(),
          supabase.from('variant_margins').select('*'),
          supabase.from('products').select('id', { count: 'exact', head: true }),
        ]);

      const target = Number(settings.data?.target_net_margin ?? 0.25);

      return {
        economics: (eco.data as unknown as StoreUnitEconomics) ?? null,
        kpi: kpi.data ?? [],
        topProducts: perf.data ?? [],
        lowStock: health.data ?? [],
        pendingOrders: pending.count ?? 0,
        unreadAlerts: alerts.data ?? [],
        pendingApprovals: approvals.data ?? [],
        marginsBelowTarget: (margins.data ?? [])
          .filter((m) => m.net_margin !== null && Number(m.net_margin) < target)
          .sort((a, b) => Number(a.net_margin) - Number(b.net_margin)),
        targetNetMargin: target,
        catalogSize: catalog.count ?? 0,
      };
    },
  });
}

/* ───────────────────────────── Produits ──────────────────────────────── */

export interface AdminProductRow extends Product {
  variantCount: number;
  stockAvailable: number;
  netMargin: number | null;
  unitsSold: number;
  revenue: number;
  categoryName: string | null;
  imagePath: string | null;
}

export function useAdminProducts(search = '', status: string | null = null) {
  return useQuery({
    queryKey: ['admin', 'products', search, status],
    queryFn: async (): Promise<AdminProductRow[]> => {
      let q = supabase.from('products').select('*').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status as Product['status']);
      if (search.trim()) q = q.ilike('name', `%${search.trim()}%`);
      const { data: products, error } = await q;
      if (error) throw error;
      if (!products?.length) return [];

      const ids = products.map((p) => p.id);
      const [variants, health, margins, perf, categories, images] = await Promise.all([
        supabase.from('product_variants').select('id, product_id').in('product_id', ids),
        supabase.from('inventory_health').select('product_id, available').in('product_id', ids),
        supabase.from('variant_margins').select('product_id, net_margin').in('product_id', ids),
        supabase.from('product_performance').select('*').in('product_id', ids),
        supabase.from('categories').select('id, name'),
        supabase.from('product_images').select('product_id, storage_path, position')
          .in('product_id', ids).order('position'),
      ]);

      const variantsBy = groupBy(variants.data ?? [], (v) => v.product_id);
      const healthBy = groupBy(health.data ?? [], (h) => h.product_id);
      const marginsBy = groupBy(margins.data ?? [], (m) => m.product_id);
      const perfBy = new Map((perf.data ?? []).map((p) => [p.product_id, p]));
      const catBy = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
      const imageBy = groupBy(images.data ?? [], (i) => i.product_id);

      return products.map((p) => {
        const ms = (marginsBy.get(p.id) ?? []).map((m) => Number(m.net_margin)).filter((n) => !Number.isNaN(n));
        const perfRow = perfBy.get(p.id);
        return {
          ...p,
          variantCount: (variantsBy.get(p.id) ?? []).length,
          stockAvailable: (healthBy.get(p.id) ?? []).reduce((s, h) => s + h.available, 0),
          netMargin: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null,
          unitsSold: perfRow?.units_sold ?? 0,
          revenue: Number(perfRow?.revenue ?? 0),
          categoryName: p.category_id ? catBy.get(p.category_id) ?? null : null,
          imagePath: (imageBy.get(p.id) ?? [])[0]?.storage_path ?? null,
        };
      });
    },
  });
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'product', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data: product, error } = await supabase
        .from('products').select('*').eq('id', id!).single();
      if (error) throw error;
      const [variants, options, images, margins, health] = await Promise.all([
        supabase.from('product_variants').select('*').eq('product_id', id!).order('position'),
        supabase.from('product_options').select('*').eq('product_id', id!).order('position'),
        supabase.from('product_images').select('*').eq('product_id', id!).order('position'),
        supabase.from('variant_margins').select('*').eq('product_id', id!),
        supabase.from('inventory_health').select('*').eq('product_id', id!),
      ]);
      const optionIds = (options.data ?? []).map((o) => o.id);
      const { data: values } = await supabase
        .from('product_option_values').select('*')
        .in('option_id', optionIds.length ? optionIds : ['00000000-0000-0000-0000-000000000000'])
        .order('position');
      const optionValues: ProductOptionValue[] = values ?? [];
      return {
        product,
        variants: variants.data ?? [],
        options: (options.data ?? []).map((o) => ({
          ...o, values: optionValues.filter((v) => v.option_id === o.id),
        })),
        images: images.data ?? [],
        margins: margins.data ?? [],
        health: health.data ?? [],
      };
    },
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Product> & { id?: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { data, error } = await supabase.from('products').update(rest).eq('id', id)
          .select('*').single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('products').insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}

/* ───────────────────────────── Catégories ────────────────────────────── */

export function useAdminCategories() {
  return useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async (): Promise<(Category & { productCount: number })[]> => {
      const [{ data: categories }, { data: products }] = await Promise.all([
        supabase.from('categories').select('*').order('position'),
        supabase.from('products').select('category_id'),
      ]);
      const counts = new Map<string, number>();
      for (const p of products ?? []) {
        if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
      }
      return (categories ?? []).map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 }));
    },
  });
}

/* ────────────────────────────── Stocks ──────────────────────────────── */

export function useInventory(onlyRestock = false) {
  return useQuery({
    queryKey: ['admin', 'inventory', onlyRestock],
    queryFn: async (): Promise<InventoryHealth[]> => {
      let q = supabase.from('inventory_health').select('*');
      if (onlyRestock) q = q.eq('needs_restock', true);
      const { data, error } = await q.order('available');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { variantId: string; delta: number; reason: string; note?: string }) => {
      const { data, error } = await supabase.rpc('adjust_stock', {
        p_variant_id: v.variantId,
        p_delta: v.delta,
        p_reason: v.reason as never,
        p_reference: null,
        p_note: v.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

/* ───────────────────────────── Commandes ────────────────────────────── */

export function useAdminOrders(status: string | null = null, search = '') {
  return useQuery({
    queryKey: ['admin', 'orders', status, search],
    queryFn: async (): Promise<(Order & { items: OrderItem[] })[]> => {
      let q = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
      if (status) q = q.eq('status', status as Order['status']);
      if (search.trim()) q = q.or(`order_number.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      const { data: orders, error } = await q;
      if (error) throw error;
      if (!orders?.length) return [];
      const { data: items } = await supabase.from('order_items').select('*')
        .in('order_id', orders.map((o) => o.id));
      const by = groupBy(items ?? [], (i) => i.order_id);
      return orders.map((o) => ({ ...o, items: by.get(o.id) ?? [] }));
    },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Order> & { id: string }) => {
      const { error } = await supabase.from('orders').update(patch).eq('id', id);
      if (error) throw error;
      // Trace l'évolution dans le journal de la commande
      await supabase.from('order_events').insert({
        order_id: id, type: 'admin_update', payload: patch as never,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

/* ───────────────────────────── Clients ──────────────────────────────── */

export interface AdminCustomerRow extends Profile {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export function useAdminCustomers(search = '') {
  return useQuery({
    queryKey: ['admin', 'customers', search],
    queryFn: async (): Promise<AdminCustomerRow[]> => {
      let q = supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (search.trim()) q = q.or(`email.ilike.%${search.trim()}%,full_name.ilike.%${search.trim()}%`);
      const { data: profiles, error } = await q;
      if (error) throw error;
      if (!profiles?.length) return [];

      const { data: orders } = await supabase
        .from('orders').select('profile_id, total, placed_at')
        .not('status', 'in', '("cancelled","refunded")');
      const by = groupBy((orders ?? []).filter((o) => o.profile_id), (o) => o.profile_id!);

      return profiles.map((p) => {
        const list = by.get(p.id) ?? [];
        return {
          ...p,
          orderCount: list.length,
          totalSpent: list.reduce((s, o) => s + Number(o.total), 0),
          lastOrderAt: list.map((o) => o.placed_at).filter(Boolean)
            .sort().reverse()[0] ?? null,
        };
      });
    },
  });
}

export function useUpdateCustomerRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Profile['role'] }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'customers'] }),
  });
}

/* ──────────────────────────── Promotions ───────────────────────────── */

export function useAdminDiscounts() {
  return useQuery({
    queryKey: ['admin', 'discounts'],
    queryFn: async (): Promise<Discount[]> => {
      const { data, error } = await supabase.from('discounts').select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ──────────────────────────── Fournisseurs ─────────────────────────── */

export function useAdminSuppliers() {
  return useQuery({
    queryKey: ['admin', 'suppliers'],
    queryFn: async (): Promise<(Supplier & { productCount: number })[]> => {
      const [{ data: suppliers }, { data: products }] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('products').select('supplier_id'),
      ]);
      const counts = new Map<string, number>();
      for (const p of products ?? []) {
        if (p.supplier_id) counts.set(p.supplier_id, (counts.get(p.supplier_id) ?? 0) + 1);
      }
      return (suppliers ?? []).map((s) => ({ ...s, productCount: counts.get(s.id) ?? 0 }));
    },
  });
}

/* ──────────────────────────── Paramètres ───────────────────────────── */

/**
 * Paramètres complets de la boutique, objectifs économiques inclus.
 * Réservé au back-office : la table n'est lisible que par l'équipe.
 */
export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    staleTime: 60_000,
    queryFn: async (): Promise<ShopSettings | null> => {
      const { data, error } = await supabase.from('shop_settings').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ShopSettings>) => {
      const { error } = await supabase.from('shop_settings').update(patch).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shop-settings'] });
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

/* ─────────────────────── Intelligence Nexscope ─────────────────────── */

export function useNexscopeSkills() {
  return useQuery({
    queryKey: ['admin', 'nexscope-skills'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NexscopeSkill[]> => {
      const { data, error } = await supabase.from('nexscope_skills').select('*')
        .eq('is_enabled', true).order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSkillRuns(skillSlug?: string | null, limit = 50) {
  return useQuery({
    queryKey: ['admin', 'skill-runs', skillSlug, limit],
    queryFn: async (): Promise<SkillRun[]> => {
      let q = supabase.from('skill_runs').select('*')
        .order('created_at', { ascending: false }).limit(limit);
      if (skillSlug) q = q.eq('skill_slug', skillSlug);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSkillRun(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'skill-run', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<SkillRun> => {
      const { data, error } = await supabase.from('skill_runs').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });
}

/* ──────────────────────── Veille concurrentielle ───────────────────── */

export function useCompetitors() {
  return useQuery({
    queryKey: ['admin', 'competitors'],
    queryFn: async (): Promise<(Competitor & { products: CompetitorProduct[] })[]> => {
      const [{ data: competitors }, { data: products }] = await Promise.all([
        supabase.from('competitors').select('*').order('name'),
        supabase.from('competitor_products').select('*'),
      ]);
      const by = groupBy(products ?? [], (p) => p.competitor_id);
      return (competitors ?? []).map((c) => ({ ...c, products: by.get(c.id) ?? [] }));
    },
  });
}

export function usePriceHistory(productId?: string | null) {
  return useQuery({
    queryKey: ['admin', 'price-history', productId],
    queryFn: async (): Promise<PriceHistoryRow[]> => {
      let q = supabase.from('price_history').select('*')
        .order('created_at', { ascending: false }).limit(100);
      if (productId) q = q.eq('product_id', productId);
      const { data } = await q;
      return data ?? [];
    },
  });
}

/* ───────────────────────────── Opportunités ────────────────────────── */

export function useOpportunities() {
  return useQuery({
    queryKey: ['admin', 'opportunities'],
    queryFn: async (): Promise<ProductOpportunity[]> => {
      const { data, error } = await supabase.from('product_opportunities').select('*')
        .order('total_score', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ────────────────────── Automatisations & approbations ─────────────── */

export function useAutomations() {
  return useQuery({
    queryKey: ['admin', 'automations'],
    queryFn: async (): Promise<Automation[]> => {
      const { data, error } = await supabase.from('automations').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAutomationRuns(automationId?: string | null, limit = 50) {
  return useQuery({
    queryKey: ['admin', 'automation-runs', automationId, limit],
    queryFn: async (): Promise<AutomationRun[]> => {
      let q = supabase.from('automation_runs').select('*')
        .order('started_at', { ascending: false }).limit(limit);
      if (automationId) q = q.eq('automation_id', automationId);
      const { data } = await q;
      return data ?? [];
    },
  });
}

export function useApprovals(status: string | null = 'pending') {
  return useQuery({
    queryKey: ['admin', 'approvals', status],
    queryFn: async (): Promise<ApprovalRequest[]> => {
      let q = supabase.from('approval_requests').select('*')
        .order('created_at', { ascending: false }).limit(100);
      if (status) q = q.eq('status', status as ApprovalRequest['status']);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Décision sur une demande d'approbation, puis application contrôlée. */
export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, note }: {
      id: string; decision: 'approved' | 'rejected'; note?: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('approval_requests').update({
        status: decision,
        decided_by: auth.user?.id ?? null,
        decided_at: new Date().toISOString(),
        decision_note: note ?? null,
      }).eq('id', id);
      if (error) throw error;

      // L'application effective passe par la fonction SQL, qui revérifie
      // le rôle, la décision et l'expiration avant toute écriture.
      if (decision === 'approved') {
        const { error: applyError } = await supabase.rpc('apply_approval', {
          p_approval_id: id, p_note: note ?? null,
        });
        if (applyError) {
          await supabase.from('approval_requests')
            .update({ apply_error: applyError.message }).eq('id', id);
          throw applyError;
        }
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'approvals'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'price-history'] });
    },
  });
}

export function useAlerts(includeResolved = false) {
  return useQuery({
    queryKey: ['admin', 'alerts', includeResolved],
    queryFn: async (): Promise<Alert[]> => {
      let q = supabase.from('alerts').select('*')
        .order('created_at', { ascending: false }).limit(100);
      if (!includeResolved) q = q.eq('is_resolved', false);
      const { data } = await q;
      return data ?? [];
    },
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alerts')
        .update({ is_resolved: true, is_read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

/* ───────────────────────────── Avis ───────────────────────────────── */

export function useAdminReviews(onlyPending = false) {
  return useQuery({
    queryKey: ['admin', 'reviews', onlyPending],
    queryFn: async (): Promise<(ProductReview & { productName: string })[]> => {
      let q = supabase.from('product_reviews').select('*')
        .order('created_at', { ascending: false }).limit(200);
      if (onlyPending) q = q.eq('is_published', false);
      const { data: reviews } = await q;
      if (!reviews?.length) return [];
      const { data: products } = await supabase.from('products').select('id, name')
        .in('id', [...new Set(reviews.map((r) => r.product_id))]);
      const nameBy = new Map((products ?? []).map((p) => [p.id, p.name]));
      return reviews.map((r) => ({ ...r, productName: nameBy.get(r.product_id) ?? '—' }));
    },
  });
}

export type { ProductVariant };
