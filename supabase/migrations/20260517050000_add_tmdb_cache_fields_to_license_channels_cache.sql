alter table public.license_channels_cache
  add column if not exists content_kind text,
  add column if not exists tmdb_id integer,
  add column if not exists tmdb_media_type text,
  add column if not exists tmdb_match_status text,
  add column if not exists tmdb_match_score numeric(5, 2),
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
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_content_kind_check
      check (
        content_kind is null
        or content_kind in ('live', 'movie', 'series', 'unknown')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'license_channels_cache_tmdb_media_type_check'
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_tmdb_media_type_check
      check (
        tmdb_media_type is null
        or tmdb_media_type in ('movie', 'tv')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'license_channels_cache_tmdb_match_status_check'
  ) then
    alter table public.license_channels_cache
      add constraint license_channels_cache_tmdb_match_status_check
      check (
        tmdb_match_status is null
        or tmdb_match_status in ('pending', 'matched', 'not_found', 'ambiguous', 'skipped', 'error')
      );
  end if;
end $$;

create index if not exists idx_license_channels_cache_content_kind
  on public.license_channels_cache (content_kind);

create index if not exists idx_license_channels_cache_tmdb_match_status
  on public.license_channels_cache (tmdb_match_status);

create index if not exists idx_license_channels_cache_tmdb_id
  on public.license_channels_cache (tmdb_id)
  where tmdb_id is not null;
