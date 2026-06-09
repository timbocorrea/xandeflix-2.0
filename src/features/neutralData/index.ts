export type {
  NeutralCatalogItem,
  NeutralCatalogSection,
  NeutralCollectionInput,
  NeutralContentArtwork,
  NeutralContentIdentity,
  NeutralContentMetadata,
  NeutralContentOrigin,
  NeutralDataSourceAdapter,
  NeutralDataSourceCapabilities,
  NeutralDataSourceHealth,
  NeutralListInput,
  NeutralLiveChannelInput,
  NeutralMediaType,
  NeutralPlaybackInput,
  NeutralRuntimePlaybackRef,
} from '@/features/neutralData/types';

export {
  buildNeutralContentFingerprint,
  buildNeutralContentIdentity,
  buildNeutralContentKey,
  hasNeutralTmdbIdentity,
  isSameNeutralContent,
  normalizeNeutralText,
  normalizeNeutralToken,
} from '@/features/neutralData/lib';

export type {
  NeutralLiveChannel,
  NeutralLiveChannelIdentity,
  NeutralLiveChannelRuntimePlayback,
  NeutralLiveChannelRuntimeSourceMode,
  NeutralLiveChannelVisual,
} from '@/features/neutralData/types/neutralLiveTv.types';

export {
  buildNeutralLiveChannelFingerprint,
  mapIptvChannelToNeutralLiveChannel,
  mapIptvChannelsToNeutralLiveChannels,
} from '@/features/neutralData/lib/liveTvAdapter';
