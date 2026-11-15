-- Gigi's Vixen Vault — database setup for the web app. Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- Contains NO data. Who can see or change what is enforced here (row-level security), not in the web page.
--
-- Rules:
--   * Only emails in app_users are approved. Anyone else can finish Google sign-in but sees and saves nothing.
--   * Each approved person has their OWN closet, profile, body photos, try-ons, wish list and custom styles
--     (column "owner" = their email). They see and change only their own.
--   * Admins (role 'admin') see and change everyone's, and manage who is on app_users.
--   * The built-in style list (styles.owner is null) is shared; only admins change it.
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
-- 2026-11-15: her own coloring notes (hair, eyes, skin…) and the AI style guide (colors, shape, styles)
alter table public.profile add column if not exists coloring jsonb not null default '{}'::jsonb;
alter table public.profile add column if not exists guide jsonb not null default '{}'::jsonb;

create table if not exists public.body_photos (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  label text not null default 'Front', image_path text not null, thumb_path text);

create table if not exists public.styles (
  name text primary key, description text default '', custom boolean not null default false,
  sort_order integer not null default 100);

create table if not exists public.tryons (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  title text not null default '', style text default '', item_ids uuid[] not null default '{}',
  body_photo_id uuid references public.body_photos(id) on delete set null,
  image_path text not null, thumb_path text);

create table if not exists public.wishlist (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), piece text not null, category text default 'other', color text default '',
  why text default '', search text default '', pairs_with uuid[] not null default '{}', priority text default '',
  status text not null default 'want', source text default '');

create table if not exists public.app_users (email text primary key, name text, role text not null default 'member');

insert into storage.buckets (id, name, public) values ('vault', 'vault', false) on conflict (id) do nothing;

-- ---------------------------------------------------------------- who is signed in
create or replace function public.me() returns text language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where email = public.me()) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where email = public.me() and role = 'admin') $$;

-- ---------------------------------------------------------------- 2026-11-16: one closet per person
-- Every row gets an owner (email). Rows from before belong to the one non-admin user (Gigi).
-- Her photo folder: new photos go under <folder>/items/… where folder = first 16 hex of sha256(email).
create or replace function public.folder_for(email text) returns text language sql immutable as $$
  select substr(encode(sha256(convert_to(lower(coalesce(email, '')), 'UTF8')), 'hex'), 1, 16) $$;
create or replace function public.my_folder() returns text language sql stable as $$ select public.folder_for(public.me()) $$;

alter table public.items       add column if not exists owner text;
alter table public.body_photos add column if not exists owner text;
alter table public.tryons      add column if not exists owner text;
alter table public.wishlist    add column if not exists owner text;
alter table public.profile     add column if not exists owner text;
alter table public.styles      add column if not exists owner text;  -- null = the shared built-in list
alter table public.profile     add column if not exists wear text not null default 'womens';  -- 'womens' | 'mens'

-- profile: one row per person instead of the single row id = 1
alter table public.profile drop constraint if exists profile_id_check;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.profile'::regclass and contype = 'p'
             and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)') then
    alter table public.profile drop constraint profile_pkey;
  end if;
end $$;
alter table public.profile alter column id drop not null;

-- styles: key by id so two people can each have a custom style with the same name
alter table public.styles add column if not exists id uuid not null default gen_random_uuid();
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.styles'::regclass and contype = 'p'
             and pg_get_constraintdef(oid) = 'PRIMARY KEY (name)') then
    alter table public.styles drop constraint styles_pkey;
    alter table public.styles add primary key (id);
  end if;
end $$;

do $$ declare legacy text; n int; begin
  if exists (select 1 from public.items where owner is null) or exists (select 1 from public.body_photos where owner is null)
     or exists (select 1 from public.tryons where owner is null) or exists (select 1 from public.wishlist where owner is null)
     or exists (select 1 from public.styles where owner is null and custom)
     or exists (select 1 from public.profile where owner is null and (measurements <> '{}'::jsonb or coalesce(array_length(my_styles, 1), 0) > 0)) then
    select count(*) into n from public.app_users where role <> 'admin';
    if n <> 1 then raise exception 'Expected exactly one non-admin person to own the existing closet, found %. Ask Claude.', n; end if;
    select email into legacy from public.app_users where role <> 'admin';
    update public.items       set owner = legacy where owner is null;
    update public.body_photos set owner = legacy where owner is null;
    update public.tryons      set owner = legacy where owner is null;
    update public.wishlist    set owner = legacy where owner is null;
    update public.styles      set owner = legacy where owner is null and custom;
    update public.profile     set owner = legacy where owner is null;
  end if;
  delete from public.profile where owner is null;  -- an empty placeholder row from the old single-profile setup
end $$;

alter table public.items       alter column owner set default public.me(), alter column owner set not null;
alter table public.body_photos alter column owner set default public.me(), alter column owner set not null;
alter table public.tryons      alter column owner set default public.me(), alter column owner set not null;
alter table public.wishlist    alter column owner set default public.me(), alter column owner set not null;
alter table public.profile     alter column owner set default public.me(), alter column owner set not null;
alter table public.styles      alter column owner set default public.me();
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profile'::regclass and contype = 'p') then
    alter table public.profile add primary key (owner);
  end if;
end $$;
create unique index if not exists styles_owner_name_idx on public.styles (coalesce(owner, ''), lower(name));
create index if not exists items_owner_idx on public.items (owner);

-- may this person open this photo? Admins: all. Others: their own folder, or an older photo one of their rows uses.
create or replace function public.can_see_photo(path text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or split_part(path, '/', 1) = public.my_folder()
    or exists (select 1 from public.items where owner = public.me() and (image_path = path or thumb_path = path))
    or exists (select 1 from public.body_photos where owner = public.me() and (image_path = path or thumb_path = path))
    or exists (select 1 from public.tryons where owner = public.me() and (image_path = path or thumb_path = path)) $$;

-- ---------------------------------------------------------------- lock every table, then open it to approved users
do $$ declare t text; begin
  foreach t in array array['items','profile','body_photos','styles','tryons','wishlist','app_users'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- drop every existing policy on these tables, then create the current set
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('items','profile','body_photos','styles','tryons','wishlist','app_users') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "items own"       on public.items       for all to authenticated
  using (public.is_approved() and (owner = public.me() or public.is_admin())) with check (public.is_approved() and (owner = public.me() or public.is_admin()));
create policy "profile own"     on public.profile     for all to authenticated
  using (public.is_approved() and (owner = public.me() or public.is_admin())) with check (public.is_approved() and (owner = public.me() or public.is_admin()));
create policy "body photos own" on public.body_photos for all to authenticated
  using (public.is_approved() and (owner = public.me() or public.is_admin())) with check (public.is_approved() and (owner = public.me() or public.is_admin()));
create policy "tryons own"      on public.tryons      for all to authenticated
  using (public.is_approved() and (owner = public.me() or public.is_admin())) with check (public.is_approved() and (owner = public.me() or public.is_admin()));
create policy "wishlist own"    on public.wishlist    for all to authenticated
  using (public.is_approved() and (owner = public.me() or public.is_admin())) with check (public.is_approved() and (owner = public.me() or public.is_admin()));
create policy "styles read"     on public.styles for select to authenticated
  using (public.is_approved() and (owner is null or owner = public.me() or public.is_admin()));
create policy "styles add"      on public.styles for insert to authenticated
  with check (public.is_approved() and (owner = public.me() or public.is_admin()));
create policy "styles change"   on public.styles for update to authenticated
  using (public.is_approved() and (owner = public.me() or public.is_admin())) with check (public.is_approved() and (owner = public.me() or public.is_admin()));
create policy "styles remove"   on public.styles for delete to authenticated
  using (public.is_approved() and (owner = public.me() or public.is_admin()));

create policy "users read"  on public.app_users for select to authenticated using (email = public.me() or public.is_admin());
create policy "users admin" on public.app_users for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- photos (private bucket 'vault')
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vault %' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy "vault read"   on storage.objects for select to authenticated using (bucket_id = 'vault' and public.is_approved() and public.can_see_photo(name));
create policy "vault add"    on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and public.is_approved() and (split_part(name, '/', 1) = public.my_folder() or public.is_admin()));
create policy "vault change" on storage.objects for update to authenticated
  using (bucket_id = 'vault' and public.is_approved() and public.can_see_photo(name)) with check (bucket_id = 'vault' and public.is_approved() and public.can_see_photo(name));
create policy "vault remove" on storage.objects for delete to authenticated using (bucket_id = 'vault' and public.is_approved() and public.can_see_photo(name));

revoke execute on function public.is_approved(), public.is_admin(), public.can_see_photo(text) from anon;
