/**
 * Types de la base Supabase.
 *
 * Ce fichier reflète les migrations de `supabase/migrations/`. Une fois le
 * projet Supabase créé et lié, il peut être régénéré automatiquement :
 *
 *   npm run db:types     (supabase gen types typescript)
 *
 * Il est maintenu à la main en attendant, afin que l'application soit
 * entièrement typée dès le premier lancement.
 */

export type AppRole = 'customer' | 'staff' | 'admin';
export type ProductStatus = 'draft' | 'active' | 'archived';
export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
export type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled' | 'returned';
export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping';
export type StockMoveReason = 'purchase' | 'sale' | 'return' | 'adjustment' | 'loss' | 'transfer' | 'initial';
export type SkillRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type AutomationStatus = 'active' | 'paused';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'applied';
export type ApprovalRisk = 'low' | 'medium' | 'high';
export type AddressKind = 'shipping' | 'billing';
export type ExecutionMode = 'engine' | 'reasoning' | 'hybrid';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Category {
  id: string; parent_id: string | null; slug: string; name: string;
  description: string | null; image_url: string | null; position: number;
  is_visible: boolean; seo_title: string | null; seo_description: string | null;
  created_at: string; updated_at: string;
}

export interface Product {
  id: string; slug: string; name: string; subtitle: string | null;
  description: string | null; story: string | null; care_guide: string | null;
  composition: string | null; brand: string; status: ProductStatus;
  category_id: string | null;
  base_price: number; compare_at_price: number | null; currency: string;
  cost_price: number | null; inbound_shipping: number; handling_fee: number;
  payment_fee_rate: number; payment_fee_fixed: number; ad_spend_ratio: number;
  return_rate: number; return_fee: number;
  weight_grams: number | null; supplier_id: string | null; lead_time_days: number;
  seo_title: string | null; seo_description: string | null; tags: string[];
  is_featured: boolean; published_at: string | null;
  created_at: string; updated_at: string;
}

export interface ProductOption { id: string; product_id: string; name: string; position: number }
export interface ProductOptionValue {
  id: string; option_id: string; value: string; swatch_hex: string | null; position: number;
}
export interface ProductVariant {
  id: string; product_id: string; sku: string; barcode: string | null; title: string;
  price: number | null; compare_at_price: number | null; cost_price: number | null;
  weight_grams: number | null; position: number; is_active: boolean;
  created_at: string; updated_at: string;
}
export interface VariantOptionValue { variant_id: string; option_value_id: string }
export interface ProductImage {
  id: string; product_id: string; variant_id: string | null; storage_path: string;
  alt: string | null; position: number; width: number | null; height: number | null;
  created_at: string;
}
export interface InventoryLevel {
  variant_id: string; on_hand: number; reserved: number;
  reorder_point: number; reorder_quantity: number; updated_at: string;
}
export interface StockMovement {
  id: number; variant_id: string; delta: number; reason: StockMoveReason;
  reference: string | null; note: string | null; created_by: string | null; created_at: string;
}
export interface VariantAvailability {
  variant_id: string; product_id: string; sku: string; on_hand: number;
  reserved: number; available: number; reorder_point: number; needs_restock: boolean;
}
export interface VariantPricing {
  variant_id: string; product_id: string; sku: string; variant_title: string;
  product_name: string; product_slug: string; price: number;
  compare_at_price: number | null; cost_price: number | null;
  currency: string; status: ProductStatus; category_id: string | null;
}
export interface VariantMargin {
  variant_id: string; product_id: string; sku: string; product_name: string;
  variant_title: string; price: number; cost_price: number | null;
  inbound_shipping: number; handling_fee: number; payment_fee: number;
  ad_cost: number; return_cost: number; gross_profit: number; net_profit: number;
  gross_margin: number | null; net_margin: number | null;
}

export interface Profile {
  id: string; email: string; full_name: string | null; phone: string | null;
  role: AppRole; accepts_marketing: boolean; locale: string; notes: string | null;
  created_at: string; updated_at: string;
}
export interface Address {
  id: string; profile_id: string; kind: AddressKind; full_name: string;
  line1: string; line2: string | null; postal_code: string; city: string;
  country_code: string; phone: string | null; is_default: boolean; created_at: string;
}
export interface Cart {
  id: string; profile_id: string | null; guest_token: string | null;
  currency: string; discount_code: string | null; created_at: string; updated_at: string;
}
export interface CartItem {
  id: string; cart_id: string; variant_id: string; quantity: number; added_at: string;
}
export interface WishlistItem { profile_id: string; product_id: string; added_at: string }

export interface ShippingZone {
  id: string; name: string; country_codes: string[]; is_active: boolean;
}
export interface ShippingMethod {
  id: string; zone_id: string; name: string; carrier: string | null; price: number;
  free_above: number | null; delay_min_days: number; delay_max_days: number;
  is_active: boolean; position: number;
}

export interface Order {
  id: string; order_number: string; profile_id: string | null; email: string;
  phone: string | null; status: OrderStatus; payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus; currency: string;
  subtotal: number; discount_total: number; shipping_total: number;
  tax_total: number; total: number; cogs_total: number;
  discount_code: string | null; shipping_method_id: string | null;
  shipping_address: Json; billing_address: Json;
  payment_provider: string | null; payment_intent_id: string | null;
  tracking_number: string | null; tracking_url: string | null;
  customer_note: string | null; internal_note: string | null;
  placed_at: string | null; paid_at: string | null; shipped_at: string | null;
  delivered_at: string | null; cancelled_at: string | null;
  created_at: string; updated_at: string;
}
export interface OrderItem {
  id: string; order_id: string; variant_id: string | null; product_name: string;
  variant_title: string; sku: string; unit_price: number; unit_cost: number;
  quantity: number; line_total: number; image_path: string | null;
}
export interface OrderEvent {
  id: number; order_id: string; type: string; payload: Json;
  actor_id: string | null; created_at: string;
}
export interface EmailLog {
  id: number; template: string; recipient: string; order_id: string | null;
  subject: string | null; provider_id: string | null; status: string;
  error: string | null; created_at: string;
}

export interface Discount {
  id: string; code: string; title: string; type: DiscountType; value: number;
  min_subtotal: number; max_discount: number | null;
  applies_to_category: string | null; applies_to_product: string | null;
  usage_limit: number | null; usage_limit_per_customer: number | null;
  used_count: number; starts_at: string; ends_at: string | null;
  is_active: boolean; created_at: string; updated_at: string;
}
export interface Promotion {
  id: string; title: string; description: string | null; type: DiscountType;
  value: number; category_id: string | null; product_id: string | null;
  starts_at: string; ends_at: string | null; is_active: boolean;
  banner_text: string | null; created_at: string;
}
export interface Supplier {
  id: string; name: string; contact_name: string | null; email: string | null;
  phone: string | null; country_code: string | null; website: string | null;
  lead_time_days: number; production_days: number; shipping_days: number;
  payment_terms_days: number; min_order_quantity: number; min_order_value: number;
  currency: string; reliability_score: number | null; notes: string | null;
  is_active: boolean; created_at: string; updated_at: string;
}
export interface PurchaseOrder {
  id: string; reference: string; supplier_id: string; status: string; currency: string;
  total: number; expected_at: string | null; received_at: string | null;
  note: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface PurchaseOrderItem {
  id: string; purchase_order_id: string; variant_id: string;
  quantity: number; unit_cost: number; received_quantity: number;
}
export interface ShopSettings {
  id: boolean; shop_name: string; tagline: string; contact_email: string;
  support_phone: string | null; currency: string; default_locale: string;
  vat_rate: number; prices_include_vat: boolean; free_shipping_above: number | null;
  target_net_margin: number; target_cac: number | null; monthly_fixed_costs: number;
  ai_model: string; ai_enabled: boolean; address: Json; social: Json;
  announcement: string | null; updated_at: string;
}

/** Sous-ensemble publiable de `shop_settings` (vue `shop_public_settings`). */
export interface ShopPublicSettings {
  shop_name: string; tagline: string; contact_email: string;
  support_phone: string | null; currency: string; default_locale: string;
  vat_rate: number; prices_include_vat: boolean;
  free_shipping_above: number | null; address: Json; social: Json;
  announcement: string | null;
}

export interface NexscopeSkill {
  slug: string; name: string; category: string; platform: string | null;
  emoji: string | null; description: string; source_path: string;
  execution_mode: ExecutionMode; engine_key: string | null; has_scripts: boolean;
  requires_external_data: boolean; external_data_note: string | null;
  is_enabled: boolean; is_core: boolean; position: number;
  instructions: string | null; instructions_sha: string | null;
  instructions_fetched_at: string | null; created_at: string; updated_at: string;
}
export interface SkillRun {
  id: string; skill_slug: string; title: string; status: SkillRunStatus;
  execution_mode: string; product_id: string | null; variant_id: string | null;
  category_id: string | null; inputs: Json; context_snapshot: Json;
  engine_output: Json; report_markdown: string | null; recommendations: Json;
  metrics: Json; model: string | null; input_tokens: number | null;
  output_tokens: number | null; duration_ms: number | null; error: string | null;
  is_pinned: boolean; automation_id: string | null; created_by: string | null;
  created_at: string; completed_at: string | null;
}
export interface Competitor {
  id: string; name: string; website: string | null; platform: string | null;
  country_code: string | null; positioning: string | null; notes: string | null;
  is_tracked: boolean; created_at: string;
}
export interface CompetitorProduct {
  id: string; competitor_id: string; product_id: string | null; title: string;
  url: string | null; external_sku: string | null; currency: string;
  last_price: number | null; last_checked_at: string | null;
  is_tracked: boolean; created_at: string;
}
export interface PriceObservation {
  id: number; competitor_product_id: string; price: number;
  shipping_price: number | null; in_stock: boolean | null;
  source: 'manual' | 'csv_import' | 'api' | 'automation'; observed_at: string;
}
export interface PriceHistoryRow {
  id: number; product_id: string; variant_id: string | null;
  old_price: number | null; new_price: number; reason: string | null;
  skill_run_id: string | null; approved_by: string | null; created_at: string;
}
export interface ProductOpportunity {
  id: string; title: string; category_hint: string | null;
  source: 'manual' | 'skill_run' | 'import'; skill_run_id: string | null;
  demand_score: number | null; competition_score: number | null;
  margin_score: number | null; logistics_score: number | null;
  total_score: number | null; verdict: string | null;
  est_cost: number | null; est_price: number | null; est_margin_pct: number | null;
  rationale: string | null; evidence: Json;
  status: 'new' | 'researching' | 'validated' | 'rejected' | 'launched';
  converted_product_id: string | null; created_by: string | null;
  created_at: string; updated_at: string;
}
export interface ProductReview {
  id: string; product_id: string; profile_id: string | null; order_id: string | null;
  author_name: string; rating: number; title: string | null; body: string | null;
  is_verified: boolean; is_published: boolean; source: string; created_at: string;
}
export interface BrandMention {
  id: string; source: string; url: string | null; title: string | null;
  excerpt: string | null; sentiment: 'positive' | 'neutral' | 'negative' | null;
  severity: 'info' | 'warning' | 'critical' | null; is_handled: boolean;
  detected_at: string; created_at: string;
}
export interface Automation {
  id: string; name: string; description: string | null;
  kind: 'skill_analysis' | 'price_alert' | 'stock_alert' | 'competitor_watch'
      | 'sales_report' | 'price_recommendation' | 'performance_tracking';
  skill_slug: string | null; status: AutomationStatus;
  schedule_cron: string; timezone: string; config: Json;
  requires_approval: boolean; max_price_change_pct: number; notify_email: string | null;
  last_run_at: string | null; last_status: string | null; next_run_at: string | null;
  run_count: number; created_by: string | null; created_at: string; updated_at: string;
}
export interface AutomationRun {
  id: string; automation_id: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  trigger_source: 'schedule' | 'manual' | 'webhook'; summary: string | null;
  findings: Json; skill_run_id: string | null; approvals_created: number;
  alerts_created: number; error: string | null; duration_ms: number | null;
  started_at: string; finished_at: string | null;
}
export interface ApprovalRequest {
  id: string;
  action_type: 'price_change' | 'bulk_price_change' | 'ad_budget_change'
             | 'purchase_order' | 'inventory_adjustment' | 'discount_creation' | 'bulk_email';
  risk: ApprovalRisk; status: ApprovalStatus; title: string; rationale: string;
  payload: Json; previous_state: Json; estimated_impact: Json;
  source_automation_id: string | null; source_skill_run_id: string | null;
  product_id: string | null; expires_at: string; decided_by: string | null;
  decided_at: string | null; decision_note: string | null;
  applied_at: string | null; apply_error: string | null; created_at: string;
}
export interface Alert {
  id: string; kind: string; severity: 'info' | 'warning' | 'critical';
  title: string; message: string; data: Json;
  product_id: string | null; variant_id: string | null; automation_id: string | null;
  is_read: boolean; is_resolved: boolean; created_at: string;
}

export interface KpiDaily {
  day: string; orders: number; customers: number; revenue: number;
  subtotal: number; discounts: number; shipping: number; cogs: number;
  gross_profit: number; gross_margin: number | null;
  average_order_value: number; units: number | null;
}
export interface ProductPerformance {
  product_id: string; name: string; slug: string; status: ProductStatus;
  category_id: string | null; category_name: string | null;
  units_sold: number; revenue: number; cogs: number; gross_profit: number;
  gross_margin: number | null; order_count: number; last_sold_at: string | null;
  stock_available: number; average_rating: number | null; review_count: number;
}
export interface InventoryHealth {
  variant_id: string; product_id: string; product_name: string; variant_title: string;
  sku: string; on_hand: number; reserved: number; available: number;
  reorder_point: number; daily_velocity: number; days_of_cover: number | null;
  needs_restock: boolean; cost_price: number | null; stock_value_at_cost: number;
}

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
type View<T> = { Row: T; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      categories: Row<Category>;
      products: Row<Product>;
      product_options: Row<ProductOption>;
      product_option_values: Row<ProductOptionValue>;
      product_variants: Row<ProductVariant>;
      variant_option_values: Row<VariantOptionValue>;
      product_images: Row<ProductImage>;
      inventory_levels: Row<InventoryLevel>;
      stock_movements: Row<StockMovement>;
      profiles: Row<Profile>;
      addresses: Row<Address>;
      carts: Row<Cart>;
      cart_items: Row<CartItem>;
      wishlist_items: Row<WishlistItem>;
      shipping_zones: Row<ShippingZone>;
      shipping_methods: Row<ShippingMethod>;
      orders: Row<Order>;
      order_items: Row<OrderItem>;
      order_events: Row<OrderEvent>;
      email_log: Row<EmailLog>;
      discounts: Row<Discount>;
      discount_redemptions: Row<{ id: number; discount_id: string; order_id: string;
        profile_id: string | null; amount: number; created_at: string }>;
      promotions: Row<Promotion>;
      suppliers: Row<Supplier>;
      purchase_orders: Row<PurchaseOrder>;
      purchase_order_items: Row<PurchaseOrderItem>;
      shop_settings: Row<ShopSettings>;
      nexscope_skills: Row<NexscopeSkill>;
      skill_runs: Row<SkillRun>;
      competitors: Row<Competitor>;
      competitor_products: Row<CompetitorProduct>;
      price_observations: Row<PriceObservation>;
      price_history: Row<PriceHistoryRow>;
      product_opportunities: Row<ProductOpportunity>;
      product_reviews: Row<ProductReview>;
      brand_mentions: Row<BrandMention>;
      automations: Row<Automation>;
      automation_runs: Row<AutomationRun>;
      approval_requests: Row<ApprovalRequest>;
      alerts: Row<Alert>;
    };
    Views: {
      variant_availability: View<VariantAvailability>;
      variant_pricing: View<VariantPricing>;
      variant_margins: View<VariantMargin>;
      kpi_daily: View<KpiDaily>;
      product_performance: View<ProductPerformance>;
      inventory_health: View<InventoryHealth>;
      shop_public_settings: View<ShopPublicSettings>;
    };
    Functions: {
      validate_discount: {
        Args: { p_code: string; p_subtotal: number; p_profile_id?: string | null };
        Returns: Json;
      };
      adjust_stock: {
        Args: { p_variant_id: string; p_delta: number; p_reason: StockMoveReason;
                p_reference?: string | null; p_note?: string | null };
        Returns: number;
      };
      store_unit_economics: { Args: { p_days?: number }; Returns: Json };
      apply_approval: { Args: { p_approval_id: string; p_note?: string | null };
                        Returns: ApprovalRequest };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      current_role: { Args: Record<string, never>; Returns: AppRole };
    };
    Enums: {
      app_role: AppRole; product_status: ProductStatus; order_status: OrderStatus;
      payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus;
      discount_type: DiscountType; stock_move_reason: StockMoveReason;
      skill_run_status: SkillRunStatus; automation_status: AutomationStatus;
      approval_status: ApprovalStatus; approval_risk: ApprovalRisk;
      address_kind: AddressKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Résultat de `validate_discount()`. */
export interface DiscountValidation {
  valid: boolean; reason?: string; discount_id?: string; code?: string;
  title?: string; type?: DiscountType; value?: number; amount?: number;
  free_shipping?: boolean;
}

/** Résultat de `store_unit_economics()`. */
export interface StoreUnitEconomics {
  window_days: number; orders: number; customers: number; revenue: number;
  cogs: number; gross_profit: number; gross_margin: number | null; aov: number;
  orders_per_customer: number | null; repeat_customers: number;
  repeat_rate: number | null; contribution_per_order: number | null;
  monthly_fixed_costs: number; target_net_margin: number; target_cac: number | null;
}
