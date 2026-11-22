import { useEffect, useState } from 'react';
import { KeyRound, Mail, Save, ShieldCheck, Sparkles, Store, Wallet } from 'lucide-react';
import { useAdminSettings, useSettingsMutation } from '@/hooks/useAdmin';
import { AdminHeader, AdminPage } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, LoadingBlock,
         Notice, Select } from '@/components/ui';
import { registryStats } from '@/lib/nexscope/registry';
import type { ShopSettings } from '@/types/database';

/** Clés et services à raccorder, et ce qui fonctionne sans eux. */
const INTEGRATIONS = [
  {
    name: 'Supabase',
    variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
    scope: 'Indispensable',
    role: 'Base de données, comptes clients, stockage des visuels et Edge Functions.',
    without: 'Rien ne fonctionne : ni catalogue, ni comptes, ni commandes.',
    required: true,
  },
  {
    name: 'Stripe',
    variables: ['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    scope: 'Paiement',
    role: 'Encaissement des commandes par carte et confirmation automatique du paiement.',
    without: "Les commandes sont enregistrées en attente de règlement, et le client en est informé explicitement. Aucun paiement n'est encaissé.",
    required: false,
  },
  {
    name: 'Anthropic',
    variables: ['ANTHROPIC_API_KEY'],
    scope: 'Analyses rédigées',
    role: "Applique les instructions réelles des SKILL.md Nexscope aux données de la boutique pour produire les analyses rédigées.",
    without: `Les ${registryStats().withEngine} modules dotés d'un moteur de calcul continuent de fonctionner : chiffres, constats et recommandations sont produits localement. Seule la rédaction de l'analyse est indisponible.`,
    required: false,
  },
  {
    name: 'Resend',
    variables: ['RESEND_API_KEY', 'SHOP_EMAIL_FROM'],
    scope: 'Emails transactionnels',
    role: 'Confirmation de commande, avis d’expédition, demande d’avis après livraison.',
    without: "Les emails sont consignés dans le journal avec le statut « en attente » et peuvent être envoyés manuellement. Aucun envoi n'est effectué.",
    required: false,
  },
  {
    name: 'Source de données marché',
    variables: ['NEXSCOPE_API_KEY', 'SERPAPI_KEY'],
    scope: 'Veille automatique (facultatif)',
    role: 'Collecte automatique des prix concurrents, volumes de recherche et tendances.',
    without: 'La veille fonctionne en saisie manuelle et en import CSV. Les modules concernés signalent ouvertement les données absentes au lieu de les estimer.',
    required: false,
  },
] as const;

export function SettingsPage() {
  const { data: settings, isLoading } = useAdminSettings();
  const mutation = useSettingsMutation();
  const [form, setForm] = useState<Partial<ShopSettings>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  if (isLoading) return <AdminPage><LoadingBlock /></AdminPage>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync({
        shop_name: form.shop_name,
        tagline: form.tagline,
        contact_email: form.contact_email,
        support_phone: form.support_phone ?? null,
        vat_rate: Number(form.vat_rate ?? 0.2),
        prices_include_vat: form.prices_include_vat,
        free_shipping_above: form.free_shipping_above !== null && form.free_shipping_above !== undefined
          ? Number(form.free_shipping_above) : null,
        target_net_margin: Number(form.target_net_margin ?? 0.25),
        target_cac: form.target_cac !== null && form.target_cac !== undefined
          ? Number(form.target_cac) : null,
        monthly_fixed_costs: Number(form.monthly_fixed_costs ?? 0),
        announcement: form.announcement ?? null,
        ai_model: form.ai_model,
        ai_enabled: form.ai_enabled,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    }
  }

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Configuration"
        title="Paramètres de la boutique"
        description="Les objectifs économiques définis ici servent de référence à tous les modules d'intelligence commerciale."
        action={
          <Button form="settings-form" type="submit" loading={mutation.isPending}
                  icon={<Save className="h-4 w-4" />}>
            Enregistrer
          </Button>
        }
      />

      {saved && <Notice tone="success" className="mb-5">Paramètres enregistrés.</Notice>}
      {error && <Notice tone="danger" className="mb-5">{error}</Notice>}

      <form id="settings-form" onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader title="Identité" subtitle="Affichée sur la boutique" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Nom de la boutique" required>
              <Input required value={form.shop_name ?? ''}
                     onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
            </Field>
            <Field label="Accroche" hint="Affichée en pied de page et sur l'accueil">
              <Input value={form.tagline ?? ''}
                     onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </Field>
            <Field label="Email de contact" required>
              <Input type="email" required value={form.contact_email ?? ''}
                     onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <Input type="tel" value={form.support_phone ?? ''}
                     onChange={(e) => setForm({ ...form, support_phone: e.target.value })} />
            </Field>
            <Field label="Bandeau d'annonce" className="sm:col-span-2"
                   hint="Affiché tout en haut de la boutique. Laisser vide pour le masquer.">
              <Input value={form.announcement ?? ''}
                     placeholder="Livraison offerte dès 120 € — retours sous 30 jours"
                     onChange={(e) => setForm({ ...form, announcement: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Prix, TVA et livraison"
                      subtitle="Détermine l'affichage et le calcul des marges" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Taux de TVA" required hint="0,20 = 20 %">
              <Input type="number" step="0.001" min={0} max={1} required
                     value={form.vat_rate ?? 0.2}
                     onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })} />
            </Field>
            <Field label="Franco de port à partir de (€)"
                   hint="Laisser vide pour ne jamais offrir la livraison">
              <Input type="number" step="0.01" min={0} value={form.free_shipping_above ?? ''}
                     onChange={(e) => setForm({
                       ...form,
                       free_shipping_above: e.target.value ? Number(e.target.value) : null,
                     })} />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox
                label="Les prix saisis incluent la TVA (affichage TTC)"
                checked={form.prices_include_vat ?? true}
                onChange={(e) => setForm({ ...form, prices_include_vat: e.target.checked })}
              />
              <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-400">
                La TVA collectée n'appartient pas à l'entreprise : elle est exclue du
                calcul de marge. La commission du prestataire de paiement, elle, est
                prélevée sur le montant TTC encaissé — les moteurs en tiennent compte.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Objectifs économiques"
            subtitle="Références utilisées par les modules d'intelligence commerciale"
            action={<Badge tone="brass" icon={<Sparkles className="h-3 w-3" />}>Nexscope</Badge>}
          />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Marge nette cible" required hint="0,25 = 25 %. Seuil « sain » du référentiel : 20 %.">
              <Input type="number" step="0.01" min={0} max={1} required
                     value={form.target_net_margin ?? 0.25}
                     onChange={(e) => setForm({ ...form, target_net_margin: Number(e.target.value) })} />
            </Field>
            <Field label="Coût d'acquisition client cible (€)"
                   hint="Facultatif : sert au diagnostic de croissance">
              <Input type="number" step="0.01" min={0} value={form.target_cac ?? ''}
                     onChange={(e) => setForm({
                       ...form, target_cac: e.target.value ? Number(e.target.value) : null,
                     })} />
            </Field>
            <Field label="Charges fixes mensuelles (€)"
                   hint="Loyer, abonnements, salaires. Nécessaire au calcul du point mort.">
              <Input type="number" step="0.01" min={0} value={form.monthly_fixed_costs ?? 0}
                     onChange={(e) => setForm({ ...form, monthly_fixed_costs: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="border-t border-ivory-200 px-5 py-4">
            <Notice tone="info">
              Ces trois valeurs pilotent les recommandations : la marge cible
              détermine les prix conseillés et les demandes d'approbation, le coût
              d'acquisition alimente le ratio de rentabilité client, et les charges
              fixes permettent de calculer le volume nécessaire pour atteindre
              l'équilibre.
            </Notice>
          </div>
        </Card>

        <Card>
          <CardHeader title="Moteur d'analyse rédigée"
                      subtitle="Utilisé par les modules en mode analyse" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Modèle" hint="Identifiant du modèle utilisé par l'Edge Function">
              <Select value={form.ai_model ?? 'claude-opus-5'}
                      onChange={(e) => setForm({ ...form, ai_model: e.target.value })}>
                <option value="claude-opus-5">Opus — analyses approfondies</option>
                <option value="claude-sonnet-5-5">Sonnet — équilibré</option>
                <option value="claude-haiku-5-5">Haiku — rapide et économique</option>
              </Select>
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox
                label="Activer les analyses rédigées"
                checked={form.ai_enabled ?? true}
                onChange={(e) => setForm({ ...form, ai_enabled: e.target.checked })}
              />
            </div>
          </div>
        </Card>
      </form>

      {/* Services à raccorder */}
      <Card className="mt-6">
        <CardHeader
          title="Services externes"
          subtitle="Ce qui est nécessaire, ce qui est facultatif, et ce qui fonctionne sans"
        />
        <div className="divide-y divide-ivory-200">
          {INTEGRATIONS.map((integration) => (
            <div key={integration.name} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-[0.9375rem] text-ink">{integration.name}</h3>
                    <Badge tone={integration.required ? 'danger' : 'neutral'}>
                      {integration.scope}
                    </Badge>
                    {integration.required
                      ? <Badge tone="danger">Obligatoire</Badge>
                      : <Badge tone="info">Facultatif</Badge>}
                  </div>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-600">
                    {integration.role}
                  </p>
                  <p className="mt-2 rounded bg-ivory-200/60 px-3 py-2 text-[0.75rem] leading-relaxed text-ink-600">
                    <strong>Sans cette clé :</strong> {integration.without}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {integration.variables.map((v) => (
                      <code key={v} className="rounded bg-ink px-2 py-0.5 font-mono text-[0.6875rem] text-ivory">
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
                <span className="shrink-0 text-ink-300">
                  {integration.name === 'Supabase' ? <Store className="h-5 w-5" />
                    : integration.name === 'Stripe' ? <Wallet className="h-5 w-5" />
                    : integration.name === 'Anthropic' ? <Sparkles className="h-5 w-5" />
                    : integration.name === 'Resend' ? <Mail className="h-5 w-5" />
                    : <KeyRound className="h-5 w-5" />}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-ivory-300 bg-ivory-200/40 px-5 py-4">
          <p className="text-[0.8125rem] leading-relaxed text-ink-600">
            <ShieldCheck className="mb-0.5 mr-1 inline h-3.5 w-3.5 text-signal-success" aria-hidden />
            Les variables commençant par <code>VITE_</code> sont exposées au navigateur :
            seules des clés publiques y figurent. Les autres sont des secrets d'Edge
            Function, à définir avec{' '}
            <code className="rounded bg-ink px-1.5 py-0.5 font-mono text-[0.6875rem] text-ivory">
              supabase secrets set NOM=valeur
            </code>
            . Elles ne sont jamais transmises au navigateur.
          </p>
        </div>
      </Card>
    </AdminPage>
  );
}
