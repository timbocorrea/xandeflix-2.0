import type { IptvChannel } from '@/features/playlists/types/playlist';
import type {
  NeutralLiveChannel,
  NeutralLiveChannelRuntimeSourceMode,
} from '@/features/neutralData/types/neutralLiveTv.types';

const DEFAULT_LIVE_CHANNEL_NAME = 'Canal sem nome';
const DEFAULT_LIVE_GROUP_NAME = 'Canais';

function normalizeDisplayText(
  value?: string | number | null,
  fallback = '',
): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  return normalized || fallback;
}

function normalizeFingerprintToken(value?: string | number | null): string {
  return normalizeDisplayText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildNeutralLiveChannelFingerprint(channel: IptvChannel): string {
  const legacyId = normalizeFingerprintToken(channel.id);
  const name = normalizeFingerprintToken(channel.name);
  const groupName = normalizeFingerprintToken(channel.groupTitle);

  return [
    'live',
    legacyId || 'no-id',
    name || 'sem-nome',
    groupName || 'sem-grupo',
  ].join(':');
}

export function mapIptvChannelToNeutralLiveChannel(
  channel: IptvChannel,
  options: {
    sourceMode?: NeutralLiveChannelRuntimeSourceMode;
    includeRuntimePlayback?: boolean;
  } = {},
): NeutralLiveChannel {
  const name = normalizeDisplayText(channel.name, DEFAULT_LIVE_CHANNEL_NAME);
  const groupName = normalizeDisplayText(channel.groupTitle, DEFAULT_LIVE_GROUP_NAME);
  const logoUrl = normalizeDisplayText(channel.logo) || null;
  const playbackRef = normalizeDisplayText(channel.url);
  const includeRuntimePlayback = options.includeRuntimePlayback ?? true;

  return {
    kind: 'live-channel',
    identity: {
      fingerprint: buildNeutralLiveChannelFingerprint(channel),
      legacyChannelId: channel.id ?? null,
    },
    visual: {
      name,
      groupName,
      logoUrl,
    },
    playback:
      includeRuntimePlayback && playbackRef
        ? {
            playbackRef,
            sourceMode: options.sourceMode ?? 'unknown',
            runtimeOnly: true,
            nonPersistable: true,
          }
        : null,
    legacy: {
      contentKind: channel.contentKind ?? null,
    },
  };
}

export function mapIptvChannelsToNeutralLiveChannels(
  channels: IptvChannel[],
  options: {
    sourceMode?: NeutralLiveChannelRuntimeSourceMode;
    includeRuntimePlayback?: boolean;
  } = {},
): NeutralLiveChannel[] {
  return channels.map((channel) =>
    mapIptvChannelToNeutralLiveChannel(channel, options),
  );
}
