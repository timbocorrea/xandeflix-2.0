export type LocalPlaylistImportStatus =
  | 'idle'
  | 'importing'
  | 'ready'
  | 'canceled'
  | 'failed';

export type LocalPlaylistImportProgress = {
  status: LocalPlaylistImportStatus;
  sourceId: string;
  importSessionId?: string;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  totalEstimate?: number;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
};

export type LocalPlaylistImportOptions = {
  sourceId: string;
  sourceType?: 'm3u';
  playlistText: string;
  batchSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: LocalPlaylistImportProgress) => void;
};

export type LocalPlaylistImportResult = {
  progress: LocalPlaylistImportProgress;
  removedItems: number;
  unknownItems: number;
  itemsWithoutGroup: number;
  durationMs: number;
};
