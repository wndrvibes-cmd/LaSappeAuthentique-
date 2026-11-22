import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/store/cart';
import { supabase } from '@/lib/supabase';
import { Button, Field, Input, Notice } from '@/components/ui';

function AuthShell({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-4 py-14">
      <div className="text-center">
        <Link to="/" className="inline-flex flex-col items-center">
          <span className="font-display text-xl font-semibold text-ink">La Sappe</span>
          <span className="mt-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.3em] text-brass-dark">
            Authentique
          </span>
        </Link>
        <h1 className="mt-8 font-display text-2xl text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-[0.875rem] text-ink-400">{subtitle}</p>}
      </div>
      <div className="mt-8">{children}</div>
      {footer && <div className="mt-6 text-center text-[0.8125rem] text-ink-400">{footer}</div>}
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signIn } = useAuth();
  const { mergeGuestCart } = useCart();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email.trim(), password);
    if (err) { setError(err); setLoading(false); return; }

    // Le panier constitué avant connexion est rattaché au compte
    const { data } = await supabase.auth.getUser();
    if (data.user) await mergeGuestCart(data.user.id);
    setLoading(false);
    navigate(params.get('suite') ?? '/compte');
  }

  return (
    <AuthShell
      title="Se connecter"
      subtitle="Retrouvez vos commandes, vos favoris et vos adresses."
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="link-underline font-medium text-ink">Créer un compte</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Adresse email" required>
          <Input type="email" required autoComplete="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mot de passe" required>
          <Input type="password" required autoComplete="current-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" size="lg" fullWidth loading={loading}>Se connecter</Button>
        <p className="text-center">
          <Link to="/mot-de-passe-oublie" className="link-underline text-[0.8125rem] text-ink-400">
            Mot de passe oublié ?
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError('Choisissez un mot de passe de 8 caractères au minimum.');
      return;
    }
    setLoading(true);
    const { error: err } = await signUp(form.email.trim(), form.password, form.fullName.trim());
    setLoading(false);
    if (err) { setError(err); return; }
    setSent(true);
    setTimeout(() => navigate('/compte'), 2500);
  }

  if (sent) {
    return (
      <AuthShell title="Compte créé">
        <Notice tone="success" title="Vérifiez votre boîte de réception">
          Un message de confirmation vous a été envoyé à {form.email}. Cliquez sur
          le lien qu'il contient pour activer votre compte.
        </Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Pour suivre vos commandes et garder vos favoris."
      footer={
        <>
          Déjà un compte ?{' '}
          <Link to="/connexion" className="link-underline font-medium text-ink">Se connecter</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom complet" required>
          <Input required autoComplete="name" value={form.fullName}
                 onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>
        <Field label="Adresse email" required>
          <Input type="email" required autoComplete="email" value={form.email}
                 onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Mot de passe" required hint="8 caractères minimum">
          <Input type="password" required autoComplete="new-password" minLength={8}
                 value={form.password}
                 onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" size="lg" fullWidth loading={loading}>Créer mon compte</Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Nous vous envoyons un lien pour en définir un nouveau."
      footer={<Link to="/connexion" className="link-underline font-medium text-ink">Retour à la connexion</Link>}
    >
      {sent ? (
        <Notice tone="success" title="Message envoyé">
          Si un compte existe avec cette adresse, vous recevrez un lien de
          réinitialisation dans quelques instants.
        </Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const { error: err } = await resetPassword(email.trim());
            setLoading(false);
            if (err) setError(err); else setSent(true);
          }}
        >
          <Field label="Adresse email" required>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" size="lg" fullWidth loading={loading}>Envoyer le lien</Button>
        </form>
      )}
    </AuthShell>
  );
}
