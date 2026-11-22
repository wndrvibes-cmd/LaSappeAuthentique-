/**
 * Session et rôle de l'utilisateur.
 *
 * Le rôle est lu depuis la table `profiles` (source de vérité côté serveur,
 * protégée par RLS). Il sert uniquement à afficher ou masquer des éléments
 * d'interface : toute autorisation réelle est appliquée par la base.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppRole, Profile } from '@/types/database';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole;
  isStaff: boolean;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data ?? null);
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return;
      setSession(next);
      if (next?.user) await loadProfile(next.user.id);
      else setProfile(null);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthState>(() => {
    const role: AppRole = profile?.role ?? 'customer';
    return {
      session,
      user: session?.user ?? null,
      profile,
      role,
      isStaff: role === 'staff' || role === 'admin',
      isAdmin: role === 'admin',
      loading,

      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) return { error: null };
        return {
          error: error.message.includes('Invalid login credentials')
            ? 'Adresse email ou mot de passe incorrect.'
            : error.message.includes('Email not confirmed')
              ? 'Adresse email non confirmée : vérifiez votre boîte de réception.'
              : error.message,
        };
      },

      signUp: async (email, password, fullName) => {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${import.meta.env.VITE_SITE_URL ?? window.location.origin}/compte`,
          },
        });
        if (!error) return { error: null };
        return {
          error: error.message.includes('already registered')
            ? 'Un compte existe déjà avec cette adresse email.'
            : error.message.includes('Password should be')
              ? 'Le mot de passe doit comporter au moins 6 caractères.'
              : error.message,
        };
      },

      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },

      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${import.meta.env.VITE_SITE_URL ?? window.location.origin}/connexion`,
        });
        return { error: error?.message ?? null };
      },

      refreshProfile: async () => {
        if (session?.user) await loadProfile(session.user.id);
      },
    };
  }, [session, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
