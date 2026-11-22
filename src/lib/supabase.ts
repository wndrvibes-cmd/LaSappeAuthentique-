import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * La boutique ne peut pas fonctionner sans projet Supabase. Plutôt que de
 * laisser l'application échouer silencieusement ou afficher des données
 * fictives, on expose l'état de configuration : l'interface affiche alors
 * un écran d'installation explicite.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[La Sappe Authentique] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquante. ' +
    'Copier .env.example vers .env et renseigner les deux valeurs.',
  );
}

/** Jeton de panier invité, conservé localement et transmis au serveur. */
const GUEST_TOKEN_KEY = 'lsa.cart.token';

export function getGuestToken(): string {
  try {
    let token = localStorage.getItem(GUEST_TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(GUEST_TOKEN_KEY, token);
    }
    return token;
  } catch {
    // Navigation privée ou stockage bloqué : jeton éphémère en mémoire.
    return crypto.randomUUID();
  }
}

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-absente',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: {
      headers: {
        'x-application-name': 'lasappe-authentique',
        // Permet aux politiques RLS d'autoriser le panier d'un visiteur non connecté
        'x-cart-token': typeof window !== 'undefined' ? getGuestToken() : '',
      },
    },
  },
);

/** URL publique d'un visuel stocké dans Supabase Storage. */
export function storageUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export const productImageUrl = (path: string | null | undefined) =>
  storageUrl('product-images', path);

/** Appel d'une Edge Function avec le jeton de session en cours. */
export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    const message =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any)?.context?.body?.error ?? error.message ?? 'Erreur inconnue';
    return { data: null, error: String(message) };
  }
  return { data: data ?? null, error: null };
}
