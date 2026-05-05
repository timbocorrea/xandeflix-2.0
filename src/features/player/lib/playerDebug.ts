import type { PlayerTelemetryEvent } from '../types/player';

const PLAYER_DEBUG_ENABLED =
  (import.meta.env as Record<string, string | undefined>).VITE_PLAYER_DEBUG ===
  'true';

function normalizeDebugPayload(payload: Record<string, unknown> | undefined) {
  if (!payload) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  } catch {
    return payload;
  }
}

export function logPlayerDebugEvent(event: PlayerTelemetryEvent) {
  if (!PLAYER_DEBUG_ENABLED) {
    return;
  }

  const scope = `[XANDEFLIX:PLAYER:${event.source}]`;
  const payload = normalizeDebugPayload(event.data);

  if (event.level === 'error') {
    console.error(scope, event.name, event.message ?? '', payload);
    return;
  }

  if (event.level === 'warn') {
    console.warn(scope, event.name, event.message ?? '', payload);
    return;
  }

  console.log(scope, event.name, event.message ?? '', payload);
}

