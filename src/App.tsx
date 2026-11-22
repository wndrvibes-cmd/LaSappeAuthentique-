import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ShopLayout } from '@/components/shop/ShopLayout';
import { HomePage } from '@/pages/shop/Home';
import { CatalogPage } from '@/pages/shop/Catalog';
import { ProductPage } from '@/pages/shop/Product';
import { CartPage } from '@/pages/shop/Cart';
import { CheckoutPage } from '@/pages/shop/Checkout';
import { AccountPage } from '@/pages/shop/Account';
import { ForgotPasswordPage, LoginPage, SignupPage } from '@/pages/shop/Auth';
import {
  CarePage, LegalPage, OrderConfirmedPage, PrivacyPage, SearchPage, SetupRequiredPage,
  ShippingPage, SizeGuidePage, TermsPage, WishlistPage,
} from '@/pages/shop/Misc';
import { EmptyState, LoadingBlock } from '@/components/ui';
import { ButtonLink } from '@/components/ui';

/* Le back-office est chargé à la demande : il ne pèse pas sur la boutique. */
const AdminApp = lazy(() => import('@/pages/admin/AdminApp'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Garde d'accès au back-office. L'autorisation réelle est appliquée par
    les politiques RLS de la base : ce garde n'évite qu'un affichage inutile. */
function RequireStaff({ children }: { children: React.ReactNode }) {
  const { loading, user, isStaff } = useAuth();
  if (loading) return <LoadingBlock label="Vérification des accès…" />;
  if (!user) return <Navigate to="/connexion?suite=/admin" replace />;
  if (!isStaff) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <EmptyState
          title="Accès réservé à l'équipe"
          description="Votre compte n'a pas les droits nécessaires pour accéder au back-office. Un administrateur peut vous les accorder depuis la gestion des clients."
          action={<ButtonLink to="/" variant="secondary">Retour à la boutique</ButtonLink>}
        />
      </div>
    );
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24">
      <EmptyState
        title="Page introuvable"
        description="Cette adresse ne correspond à aucune page de la boutique."
        action={<ButtonLink to="/">Retour à l'accueil</ButtonLink>}
      />
    </div>
  );
}

export default function App() {
  // Sans projet Supabase, on affiche la procédure d'installation au lieu
  // d'une boutique vide ou d'un écran d'erreur technique.
  if (!isSupabaseConfigured) return <SetupRequiredPage />;

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* ───────────────────────── Boutique ───────────────────────── */}
            <Route element={<ShopLayout />}>
              <Route index element={<HomePage />} />
              <Route path="boutique" element={<CatalogPage />} />
              <Route path="categorie/:slug" element={<CatalogPage />} />
              <Route path="produit/:slug" element={<ProductPage />} />
              <Route path="recherche" element={<SearchPage />} />
              <Route path="panier" element={<CartPage />} />
              <Route path="commande" element={<CheckoutPage />} />
              <Route path="commande/confirmee" element={<OrderConfirmedPage />} />
              <Route path="favoris" element={<WishlistPage />} />
              <Route path="compte" element={<AccountPage />} />
              <Route path="livraison" element={<ShippingPage />} />
              <Route path="guide-des-tailles" element={<SizeGuidePage />} />
              <Route path="entretien" element={<CarePage />} />
              <Route path="mentions-legales" element={<LegalPage />} />
              <Route path="confidentialite" element={<PrivacyPage />} />
              <Route path="cgv" element={<TermsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* ──────────────────────── Connexion ───────────────────────── */}
            <Route path="/connexion" element={<LoginPage />} />
            <Route path="/inscription" element={<SignupPage />} />
            <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />

            {/* ─────────────────────── Back-office ──────────────────────── */}
            <Route
              path="/admin/*"
              element={
                <RequireStaff>
                  <Suspense fallback={<LoadingBlock label="Chargement de l'administration…" />}>
                    <AdminApp />
                  </Suspense>
                </RequireStaff>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
