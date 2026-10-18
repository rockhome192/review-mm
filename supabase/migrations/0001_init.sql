-- อ่านอะไรดี. schema v1
-- Site tables are read-only to the public (publishable key). All writes go
-- through the pipeline (direct DB connection / secret key) or the dashboard.

-- AniList facts. Refreshed by the pipeline; never edit by hand (use overrides).
create table public.titles (
  anilist_id   integer primary key,
  slug         text not null unique,
  title        text not null,
  title_romaji text,
  title_native text,
  type         text not null check (type in ('manga', 'manhwa')),
  status       text,
  chapters     integer,
  volumes      integer,
  start_year   integer,
  score        integer,
  popularity   integer,
  genres       text[] not null default '{}',
  tags         text[] not null default '{}',
  also_liked   text[] not null default '{}',
  cover_url    text,
  cover_color  text,
  anilist_url  text,
  updated_at   timestamptz not null default now()
);

-- AI-written copy. Only 'published' rows are visible on the site.
create table public.blurbs (
  anilist_id       integer primary key references public.titles on delete cascade,
  hook             text not null,
  body             text not null,
  caveat           text,
  tags_th          text[] not null default '{}',
  content_warnings text[] not null default '{}',
  confidence       text check (confidence in ('high', 'medium', 'low')),
  status           text not null default 'needs_review'
                   check (status in ('published', 'needs_review')),
  model            text,
  prompt_version   text,
  updated_at       timestamptz not null default now()
);

-- One row per title per mood, so "cry >= 2" filters hit an index.
create table public.moods (
  anilist_id integer not null references public.titles on delete cascade,
  mood       text not null
             check (mood in ('action', 'romance', 'cry', 'thrill', 'comedy', 'chill')),
  score      smallint not null check (score between 0 and 3),
  reason     text not null,
  primary key (anilist_id, mood)
);
create index moods_mood_score_idx on public.moods (mood, score desc);

-- "ถ้าชอบเรื่องนี้" cards, 2 per title. same/diff are filled in a later pass.
create table public.recommendations (
  anilist_id     integer not null references public.titles on delete cascade,
  position       smallint not null check (position between 1 and 2),
  rec_title      text not null,
  rec_anilist_id integer references public.titles on delete set null,
  same           text,
  diff           text,
  primary key (anilist_id, position)
);
create index recommendations_rec_idx on public.recommendations (rec_anilist_id);

-- Legal reading / buying links. The pipeline only touches rows whose source
-- is not 'manual', so hand-entered links survive every refresh.
create table public.reading_links (
  id              bigint generated always as identity primary key,
  anilist_id      integer not null references public.titles on delete cascade,
  kind            text not null check (kind in ('th_read', 'th_buy', 'en_official')),
  site            text not null,
  url             text not null,
  source          text not null default 'manual' check (source in ('anilist', 'auto', 'manual')),
  is_affiliate    boolean not null default false,
  hidden          boolean not null default false,
  sort            smallint not null default 0,
  last_checked_at timestamptz,
  last_ok         boolean,
  unique (anilist_id, url)
);
create index reading_links_title_idx on public.reading_links (anilist_id);

-- Hand edits. Any non-null value here wins over titles/blurbs.
create table public.overrides (
  anilist_id integer primary key references public.titles on delete cascade,
  chapters   integer,
  status     text,
  premise    text,
  hidden     boolean not null default false,
  note       text,
  updated_at timestamptz not null default now()
);

-- Curated lists. "featured" is just a list with that slug.
create table public.lists (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  title       text not null,
  description text,
  sort        smallint not null default 0,
  published   boolean not null default false
);

create table public.list_items (
  list_id    bigint not null references public.lists on delete cascade,
  anilist_id integer not null references public.titles on delete cascade,
  position   smallint not null default 0,
  note       text,
  primary key (list_id, anilist_id)
);
create index list_items_title_idx on public.list_items (anilist_id);

-- Pipeline bookkeeping. Lives outside the exposed schema: no API access at all.
create schema if not exists internal;
revoke all on schema internal from anon, authenticated;

create table internal.batch_jobs (
  id          text primary key,           -- Anthropic batch id
  step        text not null check (step in ('blurb', 'mood', 'review', 'compare')),
  status      text not null default 'submitted',
  anilist_ids integer[] not null,
  cost_usd    numeric(10, 4),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- RLS on every public table; public gets SELECT only, filtered where needed.
alter table public.titles          enable row level security;
alter table public.blurbs          enable row level security;
alter table public.moods           enable row level security;
alter table public.recommendations enable row level security;
alter table public.reading_links   enable row level security;
alter table public.overrides       enable row level security;
alter table public.lists           enable row level security;
alter table public.list_items      enable row level security;

create policy "public read" on public.titles          for select to anon, authenticated using (true);
create policy "public read" on public.moods           for select to anon, authenticated using (true);
create policy "public read" on public.recommendations for select to anon, authenticated using (true);
create policy "public read" on public.overrides       for select to anon, authenticated using (true);
create policy "public read published" on public.blurbs
  for select to anon, authenticated using (status = 'published');
create policy "public read visible" on public.reading_links
  for select to anon, authenticated using (not hidden);
create policy "public read published" on public.lists
  for select to anon, authenticated using (published);
create policy "public read published" on public.list_items
  for select to anon, authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.published));

-- Data API exposure is explicit: SELECT only, no writes for public roles.
revoke all on public.titles, public.blurbs, public.moods, public.recommendations,
  public.reading_links, public.overrides, public.lists, public.list_items
  from anon, authenticated;
grant select on public.titles, public.blurbs, public.moods, public.recommendations,
  public.reading_links, public.overrides, public.lists, public.list_items
  to anon, authenticated;
