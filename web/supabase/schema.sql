-- Gigi's Vixen Vault — database setup for the web app. Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- Contains NO data. Who can see or change what is enforced here (row-level security), not in the web page.
--
-- Rules:
--   * Only emails in app_users are approved. Anyone else can finish Google sign-in but sees and saves nothing.
--   * Everyone approved (Gigi and John) sees and edits everything: closet, profile, body photos, styles, photos.
--   * Admins (role 'admin') manage who is on app_users.
--   * Backups (vixen-vault-data repo) use the secret key, which bypasses these rules.

-- ---------------------------------------------------------------- tables (same shape the Streamlit app created)
create extension if not exists pgcrypto;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  name text not null default '', category text not null default 'top', subcategory text default '',
  primary_color text default '', colors text[] default '{}', pattern text default '', material text default '',
  fit text default '', formality text default '', seasons text[] default '{}', styles text[] default '{}',
  description text default '', brand text default '', size text default '', notes text default '',
  favorite boolean not null default false, times_worn integer not null default 0, image_path text, thumb_path text);
create index if not exists items_category_idx on public.items (category);

create table if not exists public.profile (
  id integer primary key default 1 check (id = 1), updated_at timestamptz not null default now(),
  measurements jsonb not null default '{}'::jsonb, sizes jsonb not null default '{}'::jsonb,
  my_styles text[] default '{}', fit_notes text default '', color_notes text default '');
insert into public.profile (id) values (1) on conflict (id) do nothing;

create table if not exists public.body_photos (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  label text not null default 'Front', image_path text not null, thumb_path text);

create table if not exists public.styles (
  name text primary key, description text default '', custom boolean not null default false,
  sort_order integer not null default 100);

create table if not exists public.app_users (email text primary key, name text, role text not null default 'member');

insert into storage.buckets (id, name, public) values ('vault', 'vault', false) on conflict (id) do nothing;

-- ---------------------------------------------------------------- who is signed in
create or replace function public.me() returns text language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where email = public.me()) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where email = public.me() and role = 'admin') $$;

-- ---------------------------------------------------------------- lock every table, then open it to approved users
do $$ declare t text; begin
  foreach t in array array['items','profile','body_photos','styles','app_users'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- drop every existing policy on these tables, then create the current set
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('items','profile','body_photos','styles','app_users') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "items approved"       on public.items       for all to authenticated using (public.is_approved()) with check (public.is_approved());
create policy "profile approved"     on public.profile     for all to authenticated using (public.is_approved()) with check (public.is_approved());
create policy "body photos approved" on public.body_photos for all to authenticated using (public.is_approved()) with check (public.is_approved());
create policy "styles approved"      on public.styles      for all to authenticated using (public.is_approved()) with check (public.is_approved());

create policy "users read"  on public.app_users for select to authenticated using (email = public.me() or public.is_approved());
create policy "users admin" on public.app_users for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- photos (private bucket 'vault')
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vault %' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy "vault read"   on storage.objects for select to authenticated using (bucket_id = 'vault' and public.is_approved());
create policy "vault add"    on storage.objects for insert to authenticated with check (bucket_id = 'vault' and public.is_approved());
create policy "vault change" on storage.objects for update to authenticated using (bucket_id = 'vault' and public.is_approved()) with check (bucket_id = 'vault' and public.is_approved());
create policy "vault remove" on storage.objects for delete to authenticated using (bucket_id = 'vault' and public.is_approved());

revoke execute on function public.is_approved(), public.is_admin() from anon;
