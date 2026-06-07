export type NeutralLiveChannelRuntimeSourceMode =
  | 'cache'
  | 'playlist'
  | 'bootstrap-cache'
  | 'runtime'
  | 'unknown';

export type NeutralLiveChannelIdentity = {
  /**
   * Identidade visual/neutra do canal.
   *
   * Não deve conter playlist_url, stream_url nem URL de reprodução.
   * Serve apenas para agrupar/renderizar em runtime e preparar migração futura.
   */
  fingerprint: string;
  legacyChannelId: string | number | null;
};

export type NeutralLiveChannelVisual = {
  name: string;
  groupName: string;
  logoUrl: string | null;
};

export type NeutralLiveChannelRuntimePlayback = {
  /**
   * Referência efêmera para reprodução.
   *
   * Pode carregar a URL de stream somente em memória/runtime.
   * Não deve ser persistida em Supabase, banco central, analytics ou cache remoto.
   */
  playbackRef: string;
  sourceMode: NeutralLiveChannelRuntimeSourceMode;
  runtimeOnly: true;
  nonPersistable: true;
};

export type NeutralLiveChannel = {
  kind: 'live-channel';
  identity: NeutralLiveChannelIdentity;
  visual: NeutralLiveChannelVisual;
  playback: NeutralLiveChannelRuntimePlayback | null;
  legacy: {
    contentKind: string | null;
  };
};
