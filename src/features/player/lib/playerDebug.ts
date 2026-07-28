import type { PlayerTelemetryEvent } from '../types/player';

const PLAYER_DEBUG_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_PLAYER_DEBUG === 'true';

export function logPlayerDebugEvent(event: PlayerTelemetryEvent) {
  if (!PLAYER_DEBUG_ENABLED) {
    return;
  }

  const scope = `[XANDEFLIX:PLAYER:${event.source}]`;

  if (event.level === 'error') {
    console.error(scope, event.name);
    return;
  }

  if (event.level === 'warn') {
    console.warn(scope, event.name);
    return;
  }

  console.log(scope, event.name);
}
