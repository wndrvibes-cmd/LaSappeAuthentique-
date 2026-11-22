#!/usr/bin/env bash
# ============================================================================
#  Applique le schéma complet sur une base PostgreSQL jetable et exécute les
#  tests de sécurité. Ne touche à aucun projet Supabase.
#
#      ./scripts/test-db.sh
#
#  Prérequis : PostgreSQL 15 ou plus, en local.
# ============================================================================
set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGPORT="${PGPORT:-55432}"
PGDATA="${PGDATA:-/var/lib/postgresql/lsa-verify}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "PostgreSQL introuvable. Définir PGBIN, ou installer postgresql." >&2
  exit 1
fi

echo "▸ Préparation d'une base jetable sur le port $PGPORT"
id postgres >/dev/null 2>&1 || useradd -r -s /bin/bash postgres
# Arrêt d'une instance de test laissée en place par une exécution précédente
if [ -f "$PGDATA/postmaster.pid" ]; then
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -m immediate stop" >/dev/null 2>&1 || true
  sleep 1
fi
pkill -f "postgres -D $PGDATA" 2>/dev/null || true
sleep 1
rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"
su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8 --locale=C" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -c listen_addresses=localhost' -l $PGDATA/server.log start" >/dev/null
trap 'su postgres -c "$PGBIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1 || true' EXIT
sleep 2

PSQL="psql -h localhost -p $PGPORT -U postgres -q -v ON_ERROR_STOP=1"

echo "▸ Simulation de l'environnement Supabase (auth, storage, rôles)"
$PSQL >/dev/null <<'SQL'
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, raw_user_meta_data jsonb default '{}');
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
do $r$ begin create role anon; exception when duplicate_object then null; end $r$;
do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$;
do $r$ begin create role service_role; exception when duplicate_object then null; end $r$;
SQL

echo "▸ Application des migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  $PSQL -f "$f" >/dev/null 2>&1 && echo "   ✓ $(basename "$f")" \
    || { echo "   ✗ $(basename "$f")"; $PSQL -f "$f"; exit 1; }
done

echo "▸ Jeu de démonstration"
$PSQL -f "$ROOT/supabase/seed.sql" >/dev/null && echo "   ✓ seed.sql"

echo "▸ Droits accordés par Supabase aux rôles applicatifs"
$PSQL >/dev/null <<'SQL'
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
SQL

echo "▸ Tests de sécurité"
psql -h localhost -p "$PGPORT" -U postgres -f "$ROOT/tests/sql/rls.test.sql"
