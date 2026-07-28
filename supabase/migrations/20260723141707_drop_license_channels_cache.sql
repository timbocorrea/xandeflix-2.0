BEGIN;

DO $$
BEGIN
  IF to_regclass('public.license_channels_cache') IS NULL THEN
    RAISE EXCEPTION
      'SCHEMA_DROP_ABORTED_TABLE_MISSING: public.license_channels_cache';
  END IF;
END
$$;

LOCK TABLE public.license_channels_cache
IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  v_row_count bigint;
BEGIN
  SELECT count(*)
  INTO v_row_count
  FROM public.license_channels_cache;

  IF v_row_count <> 0 THEN
    RAISE EXCEPTION
      'SCHEMA_DROP_ABORTED_NONEMPTY_TABLE: % row(s)',
      v_row_count;
  END IF;
END
$$;

DROP TABLE public.license_channels_cache;

COMMIT;
