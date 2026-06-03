function normalizeEnvValue(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  tmdbApiKey: import.meta.env.VITE_TMDB_API_KEY || '',
  localCatalogSmokeTestEnabled:
    normalizeEnvValue(import.meta.env.VITE_LOCAL_CATALOG_SMOKE_TEST) === 'true',
};
