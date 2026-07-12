-- U1: diagnóstico agregado do cache legado. Não executar em produção.
-- Parâmetros psql opcionais: license_id e source_id (UUID internos; vazio = todos).
START TRANSACTION READ ONLY;

WITH scoped AS (
  SELECT
    is_active,
    content_kind,
    group_title,
    logo_url,
    tmdb_id,
    tmdb_poster_path,
    tmdb_backdrop_path,
    tmdb_match_status
  FROM public.license_channels_cache
  WHERE (NULLIF(:'license_id', '') IS NULL OR license_id = NULLIF(:'license_id', '')::uuid)
    AND (NULLIF(:'source_id', '') IS NULL OR license_iptv_source_id = NULLIF(:'source_id', '')::uuid)
)
SELECT
  COUNT(*)::bigint AS total_importado,
  COUNT(*) FILTER (WHERE is_active)::bigint AS total_ativo,
  COUNT(*) FILTER (WHERE NOT is_active)::bigint AS total_inativo,
  COUNT(*) FILTER (WHERE content_kind = 'live')::bigint AS total_live,
  COUNT(*) FILTER (WHERE content_kind = 'movie')::bigint AS total_movies,
  COUNT(*) FILTER (WHERE content_kind = 'series')::bigint AS total_series,
  COUNT(*) FILTER (WHERE content_kind = 'unknown' OR content_kind IS NULL)::bigint AS total_unknown,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(group_title), '') IS NULL)::bigint AS total_sem_grupo,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(logo_url), '') IS NOT NULL)::bigint AS total_com_logo_original,
  COUNT(*) FILTER (WHERE tmdb_id IS NOT NULL)::bigint AS total_com_tmdb,
  COUNT(*) FILTER (WHERE tmdb_poster_path IS NOT NULL)::bigint AS total_com_poster,
  COUNT(*) FILTER (WHERE tmdb_backdrop_path IS NOT NULL)::bigint AS total_com_backdrop,
  COUNT(*) FILTER (WHERE tmdb_match_status IS NULL OR tmdb_match_status = 'pending')::bigint AS total_pending,
  COUNT(*) FILTER (WHERE tmdb_match_status = 'matched')::bigint AS total_matched,
  COUNT(*) FILTER (WHERE tmdb_match_status = 'not_found')::bigint AS total_no_match,
  COUNT(*) FILTER (WHERE tmdb_match_status = 'ambiguous')::bigint AS total_ambiguous,
  COUNT(*) FILTER (WHERE tmdb_match_status = 'error')::bigint AS total_error,
  COUNT(*) FILTER (WHERE tmdb_match_status = 'skipped')::bigint AS total_skipped
FROM scoped;

COMMIT;

-- NAO_MENSURAVEL_NO_SCHEMA_ATUAL:
-- total_episodes: requer content_kind canônico series_episode.
-- total_radio: requer content_kind canônico radio.
-- total_processing: requer status persistido processing.
-- total_visible: requer política/campo canônico de visibilidade.
-- total_playable: requer política de validação reproduzível; a URL não deve ser exposta.
-- source_type e dimensões raw_category também exigem persistência canônica futura.
