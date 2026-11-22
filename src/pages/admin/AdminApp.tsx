import { Route, Routes } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { DashboardPage } from './Dashboard';
import { AnalyticsPage } from './Analytics';
import { ProductsPage } from './Products';
import { ProductEditPage } from './ProductEdit';
import { CategoriesPage, InventoryPage, ReviewsPage } from './CatalogAdmin';
import { OrdersPage } from './Orders';
import { CustomersPage, PromotionsPage, SuppliersPage } from './SalesAdmin';
import { IntelligencePage } from './Intelligence';
import { SkillRunnerPage } from './SkillRunner';
import { CompetitorsPage, OpportunitiesPage, SavedAnalysesPage,
         SavedAnalysisDetailPage } from './IntelligenceExtra';
import { AlertsPage, ApprovalsPage, AutomationsPage } from './Automation';
import { SettingsPage } from './Settings';
import { EmptyState, ButtonLink } from '@/components/ui';
import { AdminPage } from '@/components/admin/AdminLayout';

function AdminNotFound() {
  return (
    <AdminPage>
      <EmptyState
        title="Page introuvable"
        description="Cette section de l'administration n'existe pas."
        action={<ButtonLink to="/admin" variant="secondary">Tableau de bord</ButtonLink>}
      />
    </AdminPage>
  );
}

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="statistiques" element={<AnalyticsPage />} />
        <Route path="alertes" element={<AlertsPage />} />

        <Route path="produits" element={<ProductsPage />} />
        <Route path="produits/:id" element={<ProductEditPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="stocks" element={<InventoryPage />} />
        <Route path="avis" element={<ReviewsPage />} />

        <Route path="commandes" element={<OrdersPage />} />
        <Route path="clients" element={<CustomersPage />} />
        <Route path="promotions" element={<PromotionsPage />} />
        <Route path="fournisseurs" element={<SuppliersPage />} />

        <Route path="intelligence" element={<IntelligencePage />} />
        <Route path="intelligence/:slug" element={<SkillRunnerPage />} />
        <Route path="analyses" element={<SavedAnalysesPage />} />
        <Route path="analyses/:id" element={<SavedAnalysisDetailPage />} />
        <Route path="veille" element={<CompetitorsPage />} />
        <Route path="opportunites" element={<OpportunitiesPage />} />

        <Route path="automatisations" element={<AutomationsPage />} />
        <Route path="approbations" element={<ApprovalsPage />} />

        <Route path="parametres" element={<SettingsPage />} />
        <Route path="*" element={<AdminNotFound />} />
      </Route>
    </Routes>
  );
}
