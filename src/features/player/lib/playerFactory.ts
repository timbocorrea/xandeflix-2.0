import type {
  PlayerPreparationResult,
  UniversalPlayerSource,
} from '../types/player';
import { detectStreamKind } from './detectStreamKind';

const IMPLEMENTED_PLAYER_KINDS = new Set(['mp4', 'hls', 'mpegts']);

export function prepareUniversalPlayerSource(
  source: UniversalPlayerSource,
): PlayerPreparationResult {
  if (!source.url.trim()) {
    return {
      ok: false,
      error: {
        code: 'MISSING_STREAM_URL',
        message: 'Nenhuma URL de stream foi informada.',
      },
    };
  }

  const stream = detectStreamKind(source.url, source.mimeType);

  if (!IMPLEMENTED_PLAYER_KINDS.has(stream.kind)) {
    return {
      ok: false,
      stream,
      error: {
        code: 'ADAPTER_NOT_IMPLEMENTED',
        message: `O adaptador para stream ${stream.kind} ainda não foi implementado.`,
      },
    };
  }

  return {
    ok: true,
    stream,
  };
}
