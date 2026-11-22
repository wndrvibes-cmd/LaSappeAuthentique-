import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Bell, Boxes, Brain, ClipboardCheck, Cog, Compass,
  Eye, LayoutDashboard, Menu, MessageSquareQuote, Package, PercentCircle,
  Receipt, Store, Tags, Truck, Users, Workflow, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts, useApprovals } from '@/hooks/useAdmin';
import { registryStats } from '@/lib/nexscope/registry';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

const SECTIONS: {
  title: string;
  items: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; badge?: 'alerts' | 'approvals' }[];
}[] = [
  {
    title: 'Pilotage',
    items: [
      { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
      { to: '/admin/statistiques', label: 'Statistiques', icon: BarChart3 },
      { to: '/admin/alertes', label: 'Alertes', icon: Bell, badge: 'alerts' },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { to: '/admin/produits', label: 'Produits', icon: Package },
      { to: '/admin/categories', label: 'Catégories', icon: Tags },
      { to: '/admin/stocks', label: 'Stocks', icon: Boxes },
      { to: '/admin/avis', label: 'Avis clients', icon: MessageSquareQuote },
    ],
  },
  {
    title: 'Ventes',
    items: [
      { to: '/admin/commandes', label: 'Commandes', icon: Receipt },
      { to: '/admin/clients', label: 'Clients', icon: Users },
      { to: '/admin/promotions', label: 'Promotions', icon: PercentCircle },
      { to: '/admin/fournisseurs', label: 'Fournisseurs', icon: Truck },
    ],
  },
  {
    title: 'Intelligence commerciale',
    items: [
      { to: '/admin/intelligence', label: 'Modules Nexscope', icon: Brain },
      { to: '/admin/analyses', label: 'Analyses sauvegardées', icon: ClipboardCheck },
      { to: '/admin/veille', label: 'Veille concurrentielle', icon: Eye },
      { to: '/admin/opportunites', label: 'Opportunités produit', icon: Compass },
    ],
  },
  {
    title: 'Automatisation',
    items: [
      { to: '/admin/automatisations', label: 'Automatisations', icon: Workflow },
      { to: '/admin/approbations', label: 'Approbations', icon: ClipboardCheck, badge: 'approvals' },
    ],
  },
  {
    title: 'Configuration',
    items: [{ to: '/admin/parametres', label: 'Paramètres boutique', icon: Cog }],
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, isAdmin } = useAuth();
  const { data: alerts } = useAlerts();
  const { data: approvals } = useApprovals('pending');
  const stats = registryStats();

  const counts = {
    alerts: alerts?.filter((a) => !a.is_read).length ?? 0,
    approvals: approvals?.length ?? 0,
  };

  return (
    <div className="flex h-full flex-col bg-ink-900 text-ivory">
      <div className="border-b border-white/[0.07] px-5 py-5">
        <Link to="/admin" className="flex flex-col" onClick={onNavigate}>
          <span className="font-display text-base font-semibold leading-none">La Sappe</span>
          <span className="mt-1 text-[0.5625rem] font-semibold uppercase tracking-[0.26em] text-brass">
            Administration
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigation de l'administration">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="mb-1.5 px-2 text-[0.5625rem] font-bold uppercase tracking-[0.16em] text-ivory/30">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end, badge }) => {
                const count = badge ? counts[badge] : 0;
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      onClick={onNavigate}
                      className={({ isActive }) => cn(
                        'flex items-center gap-2.5 rounded px-2.5 py-2 text-[0.8125rem] transition-colors',
                        isActive
                          ? 'bg-brass/15 font-medium text-brass-light'
                          : 'text-ivory/60 hover:bg-white/[0.05] hover:text-ivory',
                      )}
                    >
                      <Icon className="h-[0.9375rem] w-[0.9375rem] shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{label}</span>
                      {count > 0 && (
                        <span className="flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-bordeaux px-1 text-[0.625rem] font-bold text-white">
                          {count}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.07] px-5 py-4">
        <p className="text-[0.6875rem] text-ivory/40">
          {stats.total} modules Nexscope · {stats.engines} moteurs de calcul
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[0.75rem] font-medium text-ivory/80">
              {profile?.full_name || profile?.email}
            </p>
            <p className="text-[0.625rem] uppercase tracking-wider text-brass">
              {isAdmin ? 'Administrateur' : 'Équipe'}
            </p>
          </div>
          <Link to="/" className="shrink-0 rounded p-1.5 text-ivory/50 transition-colors hover:bg-white/[0.07] hover:text-ivory"
                title="Voir la boutique">
            <Store className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { data: approvals } = useApprovals('pending');

  return (
    <div className="min-h-dvh bg-ivory-200">
      <div className="lg:grid lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-0 h-dvh">
            <Sidebar />
          </div>
        </aside>

        {/* En-tête mobile */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ivory-300 bg-ivory px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"
                  className="rounded p-1.5 text-ink">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <span className="font-display text-sm font-semibold text-ink">Administration</span>
          {(approvals?.length ?? 0) > 0 ? (
            <Link to="/admin/approbations" aria-label="Approbations en attente">
              <Badge tone="danger">{approvals?.length}</Badge>
            </Link>
          ) : <span className="w-8" />}
        </header>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <button type="button" aria-label="Fermer"
              className="absolute inset-0 animate-fade-in bg-ink/60" onClick={() => setOpen(false)} />
            <div className="relative h-full w-72 animate-fade-in">
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer"
                className="absolute right-3 top-4 z-10 rounded p-1.5 text-ivory/60">
                <X className="h-5 w-5" aria-hidden />
              </button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

/** En-tête de page du back-office. */
export function AdminHeader({ eyebrow, title, description, action }: {
  eyebrow?: string; title: string; description?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2.5 font-display text-2xl font-semibold text-ink lg:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[0.875rem] leading-relaxed text-ink-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function AdminPage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[90rem] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</div>;
}

/** Tuile d'indicateur. */
export function StatTile({ label, value, delta, hint, tone = 'neutral', icon }: {
  label: string; value: string; delta?: string | null; hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger'; icon?: React.ReactNode;
}) {
  const tones = {
    neutral: 'text-ink', success: 'text-signal-success',
    warning: 'text-signal-warning', danger: 'text-signal-danger',
  };
  return (
    <div className="rounded-lg border border-ivory-300 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
          {label}
        </p>
        {icon && <span className="shrink-0 text-ink-300">{icon}</span>}
      </div>
      <p className={cn('mt-2 font-display text-2xl font-semibold tabular', tones[tone])}>{value}</p>
      {delta && <p className="mt-0.5 text-[0.75rem] tabular text-ink-400">{delta}</p>}
      {hint && <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-400">{hint}</p>}
    </div>
  );
}

export { AlertTriangle };
