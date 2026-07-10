-- PR #18 / Security LGPD - Subciclo 3G
-- Rastreia complemento manual aplicado ao schema remoto de public.license_channels_cache.
-- A migration base da tabela existe em 20260515_0001_create_license_channels_cache.sql.
-- Este arquivo nao recria a tabela; apenas formaliza campos complementares ja consumidos pelas Edge Functions atuais.

alter table public.license_channels_cache
  add column if not exists content_kind text,
  add column if not exists tmdb_id integer,
  add column if not exists tmdb_media_type text,
  add column if not exists tmdb_match_status text,
  add column if not exists tmdb_match_score integer,
  add column if not exists tmdb_title text,
  add column if not exists tmdb_original_title text,
  add column if not exists tmdb_overview text,
  add column if not exists tmdb_poster_path text,
  add column if not exists tmdb_backdrop_path text,
  add column if not exists tmdb_release_year integer,
  add column if not exists tmdb_rating numeric(4, 2),
  add column if not exists tmdb_genres text[],
  add column if not exists tmdb_last_enriched_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'license_channels_cache_content_kind_check'
      and conrelid = 'public.license_channels_cache'::regclass
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_content_kind_check
      check (content_kind is null or content_kind in ('live', 'movie', 'series', 'unknown'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'license_channels_cache_tmdb_media_type_check'
      and conrelid = 'public.license_channels_cache'::regclass
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_tmdb_media_type_check
      check (tmdb_media_type is null or tmdb_media_type in ('movie', 'tv'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'license_channels_cache_tmdb_match_status_check'
      and conrelid = 'public.license_channels_cache'::regclass
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_tmdb_match_status_check
      check (
        tmdb_match_status is null
        or tmdb_match_status in ('pending', 'matched', 'not_found', 'ambiguous', 'skipped', 'error')
      )
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'license_channels_cache_tmdb_match_score_check'
      and conrelid = 'public.license_channels_cache'::regclass
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_tmdb_match_score_check
      check (tmdb_match_score is null or (tmdb_match_score >= 0 and tmdb_match_score <= 100))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'license_channels_cache_tmdb_rating_check'
      and conrelid = 'public.license_channels_cache'::regclass
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_tmdb_rating_check
      check (tmdb_rating is null or (tmdb_rating >= 0 and tmdb_rating <= 10))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'license_channels_cache_tmdb_release_year_check'
      and conrelid = 'public.license_channels_cache'::regclass
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_tmdb_release_year_check
      check (tmdb_release_year is null or (tmdb_release_year >= 1800 and tmdb_release_year <= 2100))
      not valid;
  end if;
end $$;
