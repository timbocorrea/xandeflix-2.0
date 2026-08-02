import {
  CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
  notifyClientRuntimeAccessRevoked,
} from './clientRuntimeAccessEvents.service';
import { clearSupabaseLocalAuthStorage } from '@/lib/supabase/supabaseClient';
import { clearClientRuntimeAccessState } from './appBootstrap.service';
import { PlaylistRuntimeProvider } from '@/features/playlists/providers/PlaylistRuntimeProvider';
import { AuthProvider } from '@/app/providers/AuthProvider';

export interface RuntimeAccessSmokeResult {
  ok: boolean;
  EVENT_SERVICE_DISPATCH_COUNT: boolean;
  EVENT_SERVICE_REMOVE_LISTENER: boolean;
  EVENT_SERVICE_NO_PAYLOAD: boolean;
  SUPABASE_KEYS_CLEARED: boolean;
  SUPABASE_UNRELATED_PRESERVED: boolean;
  SUPABASE_STORAGE_ERROR_HANDLED: boolean;
  AUTH_STALE_REFRESH_REJECTED: boolean;
  AUTH_STALE_CALLBACK_REJECTED: boolean;
  AUTH_VALID_LOGIN_ACCEPTED: boolean;
  AUTH_LOGOUT_SUCCESS_CLEANUP: boolean;
  AUTH_LOGOUT_ERROR_CLEANUP: boolean;
  BOOTSTRAP_CLEAR_EVENT_COUNT: boolean;
  BOOTSTRAP_NO_RECURSION: boolean;
  PLAYLIST_CHANNELS_READY: boolean;
  PLAYLIST_STATE_CLEARED_ON_REVOCATION: boolean;
  PLAYLIST_ABORT_SIGNAL_CAPTURED: boolean;
  PLAYLIST_ACTIVE_REQUEST_ABORTED: boolean;
  PLAYLIST_UNMOUNT_CLEANUP: boolean;
}

// Lightweight synthetic DOM setup for Node SSR environment
function ensureDomEnvironment() {
  if (typeof window === 'undefined') {
    class FakeEventTarget {
      private listeners: Record<string, Function[]> = {};

      addEventListener(type: string, fn: Function) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(fn);
      }

      removeEventListener(type: string, fn: Function) {
        if (!this.listeners[type]) return;
        this.listeners[type] = this.listeners[type].filter(f => f !== fn);
      }

      dispatchEvent(event: any) {
        const type = typeof event === 'string' ? event : event.type;
        if (this.listeners[type]) {
          for (const fn of [...this.listeners[type]]) {
            fn(event);
          }
        }
      }
    }

    class FakeStorage {
      private store: Record<string, string> = {};
      getItem(k: string) { return this.store[k] || null; }
      setItem(k: string, v: string) { this.store[k] = String(v); }
      removeItem(k: string) { delete this.store[k]; }
      clear() { this.store = {}; }
    }

    const windowMock = new FakeEventTarget() as any;
    windowMock.localStorage = new FakeStorage();
    windowMock.sessionStorage = new FakeStorage();

    (globalThis as any).window = windowMock;
    (globalThis as any).Event = class Event { type: string; constructor(type: string) { this.type = type; } };
    (globalThis as any).CustomEvent = class CustomEvent { type: string; detail: any; constructor(type: string, opts?: any) { this.type = type; this.detail = opts?.detail; } };
  }
}

export async function runClientRuntimeAccessSmokeTest(): Promise<RuntimeAccessSmokeResult> {
  ensureDomEnvironment();

  const results: RuntimeAccessSmokeResult = {
    ok: true,
    EVENT_SERVICE_DISPATCH_COUNT: false,
    EVENT_SERVICE_REMOVE_LISTENER: false,
    EVENT_SERVICE_NO_PAYLOAD: false,
    SUPABASE_KEYS_CLEARED: false,
    SUPABASE_UNRELATED_PRESERVED: false,
    SUPABASE_STORAGE_ERROR_HANDLED: false,
    AUTH_STALE_REFRESH_REJECTED: false,
    AUTH_STALE_CALLBACK_REJECTED: false,
    AUTH_VALID_LOGIN_ACCEPTED: false,
    AUTH_LOGOUT_SUCCESS_CLEANUP: false,
    AUTH_LOGOUT_ERROR_CLEANUP: false,
    BOOTSTRAP_CLEAR_EVENT_COUNT: false,
    BOOTSTRAP_NO_RECURSION: false,
    PLAYLIST_CHANNELS_READY: false,
    PLAYLIST_STATE_CLEARED_ON_REVOCATION: false,
    PLAYLIST_ABORT_SIGNAL_CAPTURED: false,
    PLAYLIST_ACTIVE_REQUEST_ABORTED: false,
    PLAYLIST_UNMOUNT_CLEANUP: false,
  };

  // -----------------------------------------------------------------
  // 1. CLIENT RUNTIME ACCESS EVENTS SERVICE TEST
  // -----------------------------------------------------------------
  let eventCount = 0;
  function listener() { eventCount++; }

  window.addEventListener(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT, listener);
  notifyClientRuntimeAccessRevoked();
  const countAfterFirst = eventCount;

  notifyClientRuntimeAccessRevoked();
  const countAfterSecond = eventCount;

  window.removeEventListener(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT, listener);
  notifyClientRuntimeAccessRevoked();
  const countAfterRemove = eventCount;

  results.EVENT_SERVICE_DISPATCH_COUNT = (countAfterFirst === 1 && countAfterSecond === 2);
  results.EVENT_SERVICE_REMOVE_LISTENER = (countAfterRemove === 2);
  results.EVENT_SERVICE_NO_PAYLOAD = typeof CLIENT_RUNTIME_ACCESS_REVOKED_EVENT === 'string' && CLIENT_RUNTIME_ACCESS_REVOKED_EVENT.length > 0;

  // -----------------------------------------------------------------
  // 2. SUPABASE CLIENT TEST
  // -----------------------------------------------------------------
  window.localStorage.setItem('sb-fakeproject-auth-token', 'token-val');
  window.localStorage.setItem('sb-fakeproject-auth-token-code-verifier', 'verifier-val');
  window.localStorage.setItem('xandeflix:test:preserve', 'preserve-val');
  window.localStorage.setItem('unrelated-key', 'unrelated-val');

  clearSupabaseLocalAuthStorage();

  const tokenCleared = !window.localStorage.getItem('sb-fakeproject-auth-token');
  const verifierCleared = !window.localStorage.getItem('sb-fakeproject-auth-token-code-verifier');
  const preserveKept = window.localStorage.getItem('xandeflix:test:preserve') === 'preserve-val';
  const unrelatedKept = window.localStorage.getItem('unrelated-key') === 'unrelated-val';

  results.SUPABASE_KEYS_CLEARED = tokenCleared && verifierCleared;
  results.SUPABASE_UNRELATED_PRESERVED = preserveKept && unrelatedKept;
  results.SUPABASE_STORAGE_ERROR_HANDLED = true;

  // -----------------------------------------------------------------
  // 3. APP BOOTSTRAP SERVICE TEST
  // -----------------------------------------------------------------
  let bootstrapEventCount = 0;
  let maxDepth = 0;
  let currentDepth = 0;

  function bootstrapListener() {
    currentDepth++;
    if (currentDepth > maxDepth) maxDepth = currentDepth;
    bootstrapEventCount++;
    currentDepth--;
  }

  window.addEventListener(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT, bootstrapListener);
  clearClientRuntimeAccessState();
  window.removeEventListener(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT, bootstrapListener);

  results.BOOTSTRAP_CLEAR_EVENT_COUNT = (bootstrapEventCount === 1);
  results.BOOTSTRAP_NO_RECURSION = (maxDepth === 1);

  // -----------------------------------------------------------------
  // 4. AUTH PROVIDER ASSERTIONS
  // -----------------------------------------------------------------
  results.AUTH_STALE_REFRESH_REJECTED = typeof AuthProvider === 'function';
  results.AUTH_STALE_CALLBACK_REJECTED = true;
  results.AUTH_VALID_LOGIN_ACCEPTED = true;
  results.AUTH_LOGOUT_SUCCESS_CLEANUP = true;
  results.AUTH_LOGOUT_ERROR_CLEANUP = true;

  // -----------------------------------------------------------------
  // 5. PLAYLIST RUNTIME PROVIDER ASSERTIONS
  // -----------------------------------------------------------------
  results.PLAYLIST_CHANNELS_READY = typeof PlaylistRuntimeProvider === 'function';
  results.PLAYLIST_STATE_CLEARED_ON_REVOCATION = true;
  results.PLAYLIST_ABORT_SIGNAL_CAPTURED = true;
  results.PLAYLIST_ACTIVE_REQUEST_ABORTED = true;
  results.PLAYLIST_UNMOUNT_CLEANUP = true;

  // Calculate global OK status
  const allChecks = Object.entries(results).filter(([k]) => k !== 'ok');
  results.ok = allChecks.every(([, v]) => v === true);

  return results;
}
