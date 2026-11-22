/**
 * Clients Supabase pour les Edge Functions.
 *
 * `serviceClient` contourne RLS : réservé aux opérations serveur qui doivent
 * écrire ce que le client n'a pas le droit d'écrire (création de commande,
 * décrément de stock, journal d'emails). Il ne doit jamais servir à lire des
 * données pour le compte d'un utilisateur sans vérifier ses droits.
 *
 * `userClient` agit avec le jeton de l'appelant : il respecte RLS et sert à
 * vérifier l'identité et le rôle.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournies automatiquement par la plateforme. ' +
      'En exécution locale, les définir dans supabase/.env.local.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function userClient(req: Request): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  return createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
}

/** Vérifie que l'appelant appartient à l'équipe. Renvoie son identifiant. */
export async function requireStaff(req: Request): Promise<{ userId: string; role: string }> {
  const client = userClient(req);
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Authentification requise');

  const { data: profile } = await client
    .from('profiles').select('role').eq('id', auth.user.id).maybeSingle();

  if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
    throw new Error("Accès réservé à l'équipe de la boutique");
  }
  return { userId: auth.user.id, role: profile.role };
}
