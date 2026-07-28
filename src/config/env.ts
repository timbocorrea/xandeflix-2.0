export const SUPABASE_CONTENT_WRITES_DISABLED_REASON =
  'supabase-content-writes-disabled';

function normalizeEnvValue(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

const localCatalogSnapshotImportEnabled =
  normalizeEnvValue(
    import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_IMPORT_ENABLED,
  ) === 'true';

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  tmdbApiKey: import.meta.env.VITE_TMDB_API_KEY || '',
  disableSupabaseContentWrites:
    normalizeEnvValue(import.meta.env.VITE_DISABLE_SUPABASE_CONTENT_WRITES) === 'true',
  contentStorageMode: normalizeEnvValue(import.meta.env.VITE_CONTENT_STORAGE_MODE),
  localCatalogSmokeTestEnabled:
    normalizeEnvValue(import.meta.env.VITE_LOCAL_CATALOG_SMOKE_TEST) === 'true',
  localCatalogSnapshotImportEnabled,
  localCatalogSnapshotPromotionEnabled:
    localCatalogSnapshotImportEnabled &&
    normalizeEnvValue(
      import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_PROMOTION_ENABLED,
    ) === 'true',
};

export function areSupabaseContentWritesDisabled() {
  return env.disableSupabaseContentWrites || env.contentStorageMode === 'local';
}
