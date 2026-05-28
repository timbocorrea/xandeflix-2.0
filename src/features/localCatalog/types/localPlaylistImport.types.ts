import type { LocalCatalogItem } from './localCatalog.types';

export type LocalPlaylistImportStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'error';

export type LocalPlaylistImportProgress = {
  status: LocalPlaylistImportStatus;
  sourceId: string;
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
  playlistText: string;
  batchSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: LocalPlaylistImportProgress) => void;
};

export type LocalPlaylistImportResult = {
  progress: LocalPlaylistImportProgress;
  sampleItems: LocalCatalogItem[];
};
