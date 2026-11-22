import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Heart, Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { useCart } from '@/store/cart';
import { useAuth } from '@/hooks/useAuth';
import { useActivePromotions, useCategories, useShopSettings } from '@/hooks/useShop';
import { cn } from '@/lib/utils';

/** Bandeau d'annonce : promotion active ou message de la boutique. */
function AnnouncementBar() {
  const { data: settings } = useShopSettings();
  const { data: promotions } = useActivePromotions();
  const banner = promotions?.find((p) => p.banner_text)?.banner_text ?? settings?.announcement;
  if (!banner) return null;
  return (
    <div className="bg-ink text-ivory">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-2">
        <p className="text-center text-[0.75rem] font-medium uppercase tracking-[0.12em]">{banner}</p>
      </div>
    </div>
  );
}

export function ShopLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: categories } = useCategories();
  const { data: settings } = useShopSettings();
  const { itemCount, load } = useCart();
  const { user, isStaff } = useAuth();

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const count = itemCount();
  const roots = (categories ?? []).filter((c) => !c.parent_id);

  return (
    <div className="flex min-h-dvh flex-col bg-ivory">
      <AnnouncementBar />

      <header className={cn(
        'sticky top-0 z-40 border-b transition-all duration-300 ease-silk',
        scrolled ? 'border-ivory-300 bg-ivory/95 backdrop-blur-md' : 'border-transparent bg-ivory',
      )}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4 lg:h-20">
            <button
              type="button"
              className="-ml-2 rounded p-2 text-ink lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>

            <Link to="/" className="group flex shrink-0 flex-col items-center lg:items-start">
              <span className="font-display text-lg font-semibold leading-none tracking-tight text-ink lg:text-xl">
                La Sappe
              </span>
              <span className="mt-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.3em] text-brass-dark">
                Authentique
              </span>
            </Link>

            <nav className="hidden items-center gap-7 lg:flex" aria-label="Navigation principale">
              {roots.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/categorie/${c.slug}`}
                  className={({ isActive }) => cn(
                    'link-underline text-[0.8125rem] font-medium tracking-wide transition-colors',
                    isActive ? 'text-ink' : 'text-ink-500 hover:text-ink',
                  )}
                >
                  {c.name}
                </NavLink>
              ))}
              <NavLink
                to="/boutique"
                className={({ isActive }) => cn(
                  'link-underline text-[0.8125rem] font-medium tracking-wide transition-colors',
                  isActive ? 'text-ink' : 'text-ink-500 hover:text-ink',
                )}
              >
                Tout le vestiaire
              </NavLink>
            </nav>

            <div className="flex items-center gap-1">
              <Link to="/recherche" className="rounded p-2 text-ink-500 transition-colors hover:bg-ink/[0.05] hover:text-ink" aria-label="Rechercher">
                <Search className="h-[1.1rem] w-[1.1rem]" aria-hidden />
              </Link>
              <Link to="/favoris" className="hidden rounded p-2 text-ink-500 transition-colors hover:bg-ink/[0.05] hover:text-ink sm:block" aria-label="Mes favoris">
                <Heart className="h-[1.1rem] w-[1.1rem]" aria-hidden />
              </Link>
              <Link to={user ? '/compte' : '/connexion'} className="rounded p-2 text-ink-500 transition-colors hover:bg-ink/[0.05] hover:text-ink" aria-label={user ? 'Mon compte' : 'Se connecter'}>
                <User className="h-[1.1rem] w-[1.1rem]" aria-hidden />
              </Link>
              <Link to="/panier" className="relative rounded p-2 text-ink-500 transition-colors hover:bg-ink/[0.05] hover:text-ink" aria-label={`Panier, ${count} article(s)`}>
                <ShoppingBag className="h-[1.1rem] w-[1.1rem]" aria-hidden />
                {count > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-brass px-1 text-[0.625rem] font-bold text-ink">
                    {count}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Menu mobile */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Fermer le menu"
            className="absolute inset-0 animate-fade-in bg-ink/50" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-[82%] max-w-sm animate-fade-in bg-ivory px-6 py-5 shadow-lift">
            <div className="mb-8 flex items-center justify-between">
              <span className="font-display text-lg font-semibold text-ink">Vestiaire</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer" className="rounded p-2 text-ink-500">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {roots.map((c) => (
                <Link key={c.id} to={`/categorie/${c.slug}`}
                  className="border-b border-ivory-300 py-3.5 font-display text-base text-ink">
                  {c.name}
                </Link>
              ))}
              <Link to="/boutique" className="border-b border-ivory-300 py-3.5 font-display text-base text-ink">
                Tout le vestiaire
              </Link>
              <Link to="/favoris" className="py-3.5 text-sm text-ink-500">Mes favoris</Link>
              <Link to={user ? '/compte' : '/connexion'} className="py-1 text-sm text-ink-500">
                {user ? 'Mon compte' : 'Se connecter'}
              </Link>
              {isStaff && (
                <Link to="/admin" className="mt-4 rounded bg-ink px-4 py-3 text-center text-sm font-medium text-ivory">
                  Administration
                </Link>
              )}
            </nav>
          </div>
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="grain mt-20 border-t border-ivory-300 bg-ink text-ivory">
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-display text-xl font-semibold">La Sappe Authentique</p>
              <p className="mt-1 text-[0.5625rem] font-semibold uppercase tracking-[0.3em] text-brass">
                Depuis l'élégance
              </p>
              <p className="mt-4 max-w-xs text-[0.8125rem] leading-relaxed text-ivory/60">
                {settings?.tagline ?? 'Pièces de caractère, matières nobles, coupes soignées.'}
              </p>
            </div>

            <div>
              <p className="mb-4 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-brass">
                Le vestiaire
              </p>
              <ul className="space-y-2.5 text-[0.8125rem] text-ivory/70">
                {roots.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to={`/categorie/${c.slug}`} className="link-underline">{c.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-4 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-brass">
                Service
              </p>
              <ul className="space-y-2.5 text-[0.8125rem] text-ivory/70">
                <li><Link to="/livraison" className="link-underline">Livraison & retours</Link></li>
                <li><Link to="/guide-des-tailles" className="link-underline">Guide des tailles</Link></li>
                <li><Link to="/entretien" className="link-underline">Entretien des pièces</Link></li>
                <li><Link to="/compte" className="link-underline">Suivre ma commande</Link></li>
              </ul>
            </div>

            <div>
              <p className="mb-4 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-brass">
                Nous écrire
              </p>
              <ul className="space-y-2.5 text-[0.8125rem] text-ivory/70">
                <li>
                  <a href={`mailto:${settings?.contact_email ?? 'contact@lasappeauthentique.fr'}`} className="link-underline">
                    {settings?.contact_email ?? 'contact@lasappeauthentique.fr'}
                  </a>
                </li>
                {settings?.support_phone && <li>{settings.support_phone}</li>}
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-ivory/10 pt-6 text-[0.75rem] text-ivory/40 sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} {settings?.shop_name ?? 'La Sappe Authentique'}. Tous droits réservés.</p>
            <div className="flex gap-5">
              <Link to="/mentions-legales" className="link-underline">Mentions légales</Link>
              <Link to="/confidentialite" className="link-underline">Confidentialité</Link>
              <Link to="/cgv" className="link-underline">CGV</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
