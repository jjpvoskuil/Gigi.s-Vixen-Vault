-- Gigi's Vixen Vault — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Closet items
-- ---------------------------------------------------------------
create table if not exists items (
    id            uuid primary key default gen_random_uuid(),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    name          text not null default '',
    category      text not null default 'top',
    subcategory   text default '',
    primary_color text default '',
    colors        text[] default '{}',
    pattern       text default '',
    material      text default '',
    fit           text default '',
    formality     text default '',
    seasons       text[] default '{}',
    styles        text[] default '{}',
    description   text default '',
    brand         text default '',
    size          text default '',
    notes         text default '',
    favorite      boolean not null default false,
    times_worn    integer not null default 0,
    image_path    text,
    thumb_path    text
);
create index if not exists items_category_idx on items (category);

-- ---------------------------------------------------------------
-- Her profile (single row, id = 1)
-- ---------------------------------------------------------------
create table if not exists profile (
    id            integer primary key default 1 check (id = 1),
    updated_at    timestamptz not null default now(),
    measurements  jsonb not null default '{}'::jsonb,
    sizes         jsonb not null default '{}'::jsonb,
    my_styles     text[] default '{}',
    fit_notes     text default '',
    color_notes   text default ''
);
insert into profile (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Body photos (used for try-on in a later stage)
-- ---------------------------------------------------------------
create table if not exists body_photos (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    label       text not null default 'Front',
    image_path  text not null,
    thumb_path  text
);

-- ---------------------------------------------------------------
-- Style menu (seeded below; she can add her own in the app)
-- ---------------------------------------------------------------
create table if not exists styles (
    name        text primary key,
    description text default '',
    custom      boolean not null default false,
    sort_order  integer not null default 100
);

insert into styles (name, description, sort_order) values
  ('Casual Chic',        'Elevated everyday: good jeans, crisp tees, a great jacket', 1),
  ('Relaxed Weekend',    'Comfortable, easy layers, sneakers and soft knits', 2),
  ('Lake Life',          'Breezy linens, shorts, sandals, sun-ready pieces', 3),
  ('Athleisure',         'Leggings, joggers, sporty layers worn as everyday wear', 4),
  ('Smart Casual',       'Polished but not formal: blazers with denim, loafers', 5),
  ('Boho',               'Flowy shapes, prints, earthy tones, layered jewelry', 6),
  ('Coastal / Nautical', 'Stripes, navy and white, crisp cottons', 7),
  ('Western / Country',  'Denim, boots, suede, plaid, turquoise accents', 8),
  ('Classic',            'Timeless tailoring, neutrals, clean lines', 9),
  ('Minimalist',         'Simple shapes, few colors, quality basics', 10),
  ('Romantic',           'Soft fabrics, florals, ruffles, feminine details', 11),
  ('Edgy',               'Leather, black, hardware, attitude', 12),
  ('Preppy',             'Polos, cable knits, pleats, clean color', 13),
  ('Business Casual',    'Office-ready without a suit', 14),
  ('Date Night',         'A little dressier, flattering, confident', 15),
  ('Dressy / Event',     'Weddings, parties, formal evenings', 16),
  ('Cozy Fall',          'Sweaters, flannels, boots, warm tones', 17),
  ('Monochrome',         'One color head to toe in varied shades and textures', 18),
  ('Bold & Colorful',    'Statement colors and prints', 19),
  ('Vintage-Inspired',   'Retro silhouettes and details', 20)
on conflict (name) do nothing;

-- ---------------------------------------------------------------
-- Private photo storage bucket
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Lock everything down: only the app (using the secret key) can read/write.
-- ---------------------------------------------------------------
alter table items       enable row level security;
alter table profile     enable row level security;
alter table body_photos enable row level security;
alter table styles      enable row level security;
