-- The weekly GitHub Actions job (pipeline/weekly-trending.ts) picks the home
-- page's featured titles and the "trending" list from AniList trending.
-- It logs in as weekly_bot, which can only read the catalog and rewrite the
-- items of those two lists, so a leaked CI secret can't touch anything else.
--
-- The role is created without a password. Set one in the SQL Editor, never in a file:
--   alter role weekly_bot with login password '<long random password>';
-- Then the CI secret is the Session pooler URL with user weekly_bot.<project ref>.

-- Featured history, so a title isn't featured again within a few weeks.
create table internal.featured_history (
  week       date not null, -- Monday of the week, Bangkok time
  anilist_id integer not null,
  primary key (week, anilist_id)
);

create role weekly_bot nologin noinherit;

grant usage on schema public, internal to weekly_bot;
grant select (anilist_id, type) on public.titles to weekly_bot;
grant select (anilist_id, status) on public.blurbs to weekly_bot;
grant select (anilist_id, hidden) on public.overrides to weekly_bot;
grant select (id, slug) on public.lists to weekly_bot;
grant select, insert, delete on public.list_items to weekly_bot;
grant select, insert, delete on internal.featured_history to weekly_bot;

create policy "weekly bot read" on public.titles    for select to weekly_bot using (true);
create policy "weekly bot read" on public.blurbs    for select to weekly_bot using (true);
create policy "weekly bot read" on public.overrides for select to weekly_bot using (true);
create policy "weekly bot read" on public.lists     for select to weekly_bot using (true);

create policy "weekly bot items" on public.list_items for all to weekly_bot
  using (list_id in (select id from public.lists where slug in ('featured', 'trending')))
  with check (list_id in (select id from public.lists where slug in ('featured', 'trending')));
