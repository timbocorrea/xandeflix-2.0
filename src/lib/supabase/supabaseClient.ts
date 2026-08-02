import { createClient } from '@supabase/supabase-js'
import { env } from '../../config/env'

export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseAnonKey
)

function getSupabaseAuthStorageKey(): string | null {
  try {
    const projectRef = new URL(env.supabaseUrl).hostname.split('.')[0]

    return projectRef ? `sb-${projectRef}-auth-token` : null
  } catch {
    return null
  }
}

export function clearSupabaseLocalAuthStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  const storageKey = getSupabaseAuthStorageKey()

  if (!storageKey) {
    return
  }

  const storageKeys = [
    storageKey,
    `${storageKey}-code-verifier`,
    `${storageKey}-user`,
  ]

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of storageKeys) {
      try {
        storage.removeItem(key)
      } catch {
        // Storage indisponivel ja equivale a sessao local nao persistida.
      }
    }
  }
}
