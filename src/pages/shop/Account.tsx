import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, LogOut, MapPin, Package, Settings, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMyOrders, useWishlist } from '@/hooks/useShop';
import { productImageUrl, supabase } from '@/lib/supabase';
import { FULFILLMENT_STATUS_LABEL, ORDER_STATUS_LABEL, formatDate, formatPrice } from '@/lib/format';
import { ProductCard } from '@/components/shop/ProductCard';
import { Badge, Button, ButtonLink, Card, Checkbox, EmptyState, Field, Input,
         LoadingBlock, Notice } from '@/components/ui';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'commandes', label: 'Mes commandes', icon: Package },
  { key: 'favoris', label: 'Mes favoris', icon: Heart },
  { key: 'adresses', label: 'Mes adresses', icon: MapPin },
  { key: 'profil', label: 'Mon profil', icon: Settings },
] as const;

function OrdersTab({ profileId }: { profileId: string }) {
  const { data: orders, isLoading } = useMyOrders(profileId);
  if (isLoading) return <LoadingBlock />;
  if (!orders?.length) {
    return (
      <EmptyState
        icon={<Package className="h-9 w-9" />}
        title="Aucune commande"
        description="Vos commandes et leur suivi apparaîtront ici."
        action={<ButtonLink to="/boutique">Découvrir le vestiaire</ButtonLink>}
      />
    );
  }
  return (
    <ul className="space-y-4">
      {orders.map((order) => (
        <li key={order.id}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ivory-300 px-5 py-4">
              <div>
                <p className="font-mono text-[0.8125rem] font-medium text-ink">{order.order_number}</p>
                <p className="mt-0.5 text-[0.75rem] text-ink-400">
                  {formatDate(order.placed_at ?? order.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={
                  order.status === 'delivered' ? 'success'
                  : order.status === 'cancelled' || order.status === 'refunded' ? 'danger'
                  : order.status === 'pending' ? 'warning' : 'info'
                }>
                  {ORDER_STATUS_LABEL[order.status] ?? order.status}
                </Badge>
                <span className="text-[0.9375rem] font-medium tabular text-ink">
                  {formatPrice(Number(order.total), order.currency)}
                </span>
              </div>
            </div>

            <ul className="divide-y divide-ivory-200">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="h-14 w-11 shrink-0 overflow-hidden rounded bg-ivory-200">
                    {productImageUrl(item.image_path) ? (
                      <img src={productImageUrl(item.image_path)!} alt="" aria-hidden
                           className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[0.8125rem] text-ink-300">
                        {item.product_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-medium text-ink">{item.product_name}</p>
                    <p className="text-[0.75rem] text-ink-400">{item.variant_title} · ×{item.quantity}</p>
                  </div>
                  <span className="text-[0.8125rem] tabular text-ink-600">
                    {formatPrice(Number(item.line_total), order.currency)}
                  </span>
                </li>
              ))}
            </ul>

            {(order.tracking_number || order.fulfillment_status !== 'unfulfilled') && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ivory-300 bg-ivory-200/40 px-5 py-3.5">
                <p className="text-[0.75rem] text-ink-500">
                  Expédition : {FULFILLMENT_STATUS_LABEL[order.fulfillment_status]}
                  {order.tracking_number && <> · suivi <span className="font-mono">{order.tracking_number}</span></>}
                </p>
                {order.tracking_url && (
                  <a href={order.tracking_url} target="_blank" rel="noreferrer noopener"
                     className="link-underline text-[0.75rem] font-medium text-ink">
                    Suivre le colis
                  </a>
                )}
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function WishlistTab({ profileId }: { profileId: string }) {
  const { data: items, isLoading } = useWishlist(profileId);
  if (isLoading) return <LoadingBlock />;
  if (!items?.length) {
    return (
      <EmptyState
        icon={<Heart className="h-9 w-9" />}
        title="Aucun favori"
        description="Ajoutez des pièces à vos favoris depuis leur fiche pour les retrouver ici."
        action={<ButtonLink to="/boutique">Parcourir le vestiaire</ButtonLink>}
      />
    );
  }
  return (
    <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => <ProductCard key={item.product.id} item={item} />)}
    </div>
  );
}

function AddressesTab({ profileId }: { profileId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    full_name: '', line1: '', line2: '', postal_code: '', city: '', country_code: 'FR', phone: '',
  });
  const [addresses, setAddresses] = useState<Awaited<ReturnType<typeof fetchAddresses>>>([]);
  const [loaded, setLoaded] = useState(false);

  async function fetchAddresses() {
    const { data } = await supabase.from('addresses').select('*')
      .eq('profile_id', profileId).order('created_at', { ascending: false });
    return data ?? [];
  }

  if (!loaded) {
    void fetchAddresses().then((a) => { setAddresses(a); setLoaded(true); });
    return <LoadingBlock />;
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('addresses').insert({
        profile_id: profileId, kind: 'shipping', ...form,
        line2: form.line2 || null, phone: form.phone || null,
        is_default: addresses.length === 0,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setAdding(false);
      setForm({ full_name: '', line1: '', line2: '', postal_code: '', city: '', country_code: 'FR', phone: '' });
      setAddresses(await fetchAddresses());
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });

  return (
    <div className="space-y-5">
      {addresses.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id}>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[0.875rem] font-medium text-ink">{a.full_name}</p>
                  {a.is_default && <Badge tone="brass">Par défaut</Badge>}
                </div>
                <address className="mt-2 text-[0.8125rem] not-italic leading-relaxed text-ink-500">
                  {a.line1}<br />
                  {a.line2 && <>{a.line2}<br /></>}
                  {a.postal_code} {a.city}<br />
                  {a.country_code}
                  {a.phone && <><br />{a.phone}</>}
                </address>
                <button
                  type="button"
                  className="mt-3 text-[0.75rem] text-ink-400 transition-colors hover:text-signal-danger"
                  onClick={async () => {
                    await supabase.from('addresses').delete().eq('id', a.id);
                    setAddresses(await fetchAddresses());
                  }}
                >
                  Supprimer
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <Card className="p-5">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          >
            <Field label="Nom complet" required className="sm:col-span-2">
              <Input required value={form.full_name}
                     onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Adresse" required className="sm:col-span-2">
              <Input required value={form.line1}
                     onChange={(e) => setForm({ ...form, line1: e.target.value })} />
            </Field>
            <Field label="Complément" className="sm:col-span-2">
              <Input value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
            </Field>
            <Field label="Code postal" required>
              <Input required value={form.postal_code}
                     onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
            </Field>
            <Field label="Ville" required>
              <Input required value={form.city}
                     onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Pays" required>
              <Input required maxLength={2} value={form.country_code}
                     onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Téléphone">
              <Input type="tel" value={form.phone}
                     onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" loading={save.isPending}>Enregistrer</Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>Ajouter une adresse</Button>
      )}
    </div>
  );
}

function ProfileTab() {
  const { profile, refreshProfile, signOut, isStaff } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [marketing, setMarketing] = useState(profile?.accepts_marketing ?? false);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) return;
      const { error } = await supabase.from('profiles')
        .update({ full_name: fullName || null, phone: phone || null, accepts_marketing: marketing })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
    },
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000); },
  });

  return (
    <div className="max-w-lg space-y-6">
      <Card className="p-5">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Adresse email" hint="Pour la modifier, contactez-nous.">
            <Input value={profile?.email ?? ''} disabled />
          </Field>
          <Field label="Nom complet">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Téléphone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Checkbox
            label="Je souhaite recevoir les nouveautés et les informations de la maison"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
          />
          {saved && <Notice tone="success">Vos informations ont été enregistrées.</Notice>}
          <Button type="submit" loading={save.isPending}>Enregistrer</Button>
        </form>
      </Card>

      {isStaff && (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brass-dark" aria-hidden />
            <div>
              <p className="text-[0.875rem] font-medium text-ink">Accès à l'administration</p>
              <p className="mt-1 text-[0.8125rem] text-ink-500">
                Votre compte dispose des droits d'équipe.
              </p>
              <ButtonLink to="/admin" variant="secondary" size="sm" className="mt-3">
                Ouvrir le back-office
              </ButtonLink>
            </div>
          </div>
        </Card>
      )}

      <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </div>
  );
}

export function AccountPage() {
  const { user, profile, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('onglet') ?? 'commandes') as typeof TABS[number]['key'];

  if (loading) return <LoadingBlock />;
  if (!user) return <Navigate to="/connexion?suite=/compte" replace />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-9">
        <p className="eyebrow">Espace personnel</p>
        <h1 className="mt-3 text-display-md font-semibold text-ink">
          {profile?.full_name || 'Mon compte'}
        </h1>
        <p className="mt-1.5 text-[0.875rem] text-ink-400">{profile?.email}</p>
      </header>

      <nav className="mb-9 flex gap-1 overflow-x-auto border-b border-ivory-300" aria-label="Sections du compte">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setParams({ onglet: key })}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-[0.8125rem] font-medium transition-colors',
              tab === key
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-400 hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'commandes' && <OrdersTab profileId={user.id} />}
      {tab === 'favoris' && <WishlistTab profileId={user.id} />}
      {tab === 'adresses' && <AddressesTab profileId={user.id} />}
      {tab === 'profil' && <ProfileTab />}

      <p className="mt-12 text-center text-[0.75rem] text-ink-300">
        Une question ? <Link to="/livraison" className="link-underline">Livraison et retours</Link>
      </p>
    </div>
  );
}
