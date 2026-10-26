-- Reader 👍/👎 on each mood row of a title page ("ตรงไหม?").
-- A signal for which mood scores to re-check, not an input to the scores.
-- Visitors can only insert; nobody but the service role can read the votes.
create table public.mood_votes (
  id          bigint generated always as identity primary key,
  anilist_id  integer not null references public.titles on delete cascade,
  mood        text not null check (mood in ('action', 'romance', 'cry', 'thrill', 'comedy', 'chill')),
  agree       boolean not null,
  score_shown smallint not null check (score_shown between 0 and 3), -- scores change; keep what the voter saw
  created_at  timestamptz not null default now()
);
create index mood_votes_anilist_id_idx on public.mood_votes (anilist_id);

alter table public.mood_votes enable row level security;
create policy "public insert" on public.mood_votes for insert to anon, authenticated with check (true);

revoke all on public.mood_votes from anon, authenticated;
grant insert (anilist_id, mood, agree, score_shown) on public.mood_votes to anon, authenticated;

-- Rate limit per voter, so votes sent straight to the API (skipping the page's
-- localStorage check) can't pile up. The voter is a salted hash of their IP;
-- the raw IP is never stored. The salt rotates daily, so hashes from different
-- days can't be linked, and rows older than a day are deleted on the next vote.
create table internal.vote_salt (
  id   boolean primary key default true check (id), -- one row only
  salt text not null
);
insert into internal.vote_salt (salt)
values (encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'));

create table internal.vote_limits (
  voter_hash text not null,
  anilist_id integer not null,
  mood       text not null,
  created_at timestamptz not null default now()
);
create index vote_limits_voter_idx on internal.vote_limits (voter_hash, created_at);
create index vote_limits_created_at_idx on internal.vote_limits (created_at);

create function internal.limit_mood_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  ip      text := coalesce(headers->>'cf-connecting-ip',
                           trim(split_part(headers->>'x-forwarded-for', ',', 1)));
  voter   text;
begin
  if nullif(ip, '') is null then
    return new; -- not an API request (SQL editor, service scripts): no limit
  end if;

  select encode(sha256(convert_to(s.salt || ':' || current_date || ':' || ip, 'UTF8')), 'hex')
    into voter from internal.vote_salt s;

  -- two votes from one voter at the same moment would both pass the counts below
  perform pg_advisory_xact_lock(hashtext(voter));

  delete from internal.vote_limits where created_at < now() - interval '1 day';

  if exists (select 1 from internal.vote_limits l
             where l.voter_hash = voter and l.anilist_id = new.anilist_id and l.mood = new.mood) then
    raise exception 'already voted on this mood today';
  end if;
  if (select count(*) from internal.vote_limits l
      where l.voter_hash = voter and l.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too many votes, try again later';
  end if;

  insert into internal.vote_limits (voter_hash, anilist_id, mood) values (voter, new.anilist_id, new.mood);
  return new;
end;
$$;
revoke all on function internal.limit_mood_votes() from public, anon, authenticated;

create trigger limit_mood_votes before insert on public.mood_votes
  for each row execute function internal.limit_mood_votes();
