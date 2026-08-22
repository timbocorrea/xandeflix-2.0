import { prepareHomePlaylist } from './prepareHomePlaylist.service';
import type { AuthorizedIptvSource } from '@/features/playlists/services/authorizedIptvSource.service';
import type { CatalogRepository } from '@/features/localCatalog/repositories/catalogRepository.types';
import type { LocalCatalogImportMetadata } from '@/features/localCatalog/types/localCatalog.types';
import type { HomeVodSection } from './homeVod.service';
import type { SourceImportTask } from '@/features/playlists/types/playlist';

export type HomeEmptyRegressionSmokeTestResult = {
  ok: boolean;
  staleMetadataDidNotBypassImport: boolean;
  firstFoldHydrationDispatched: boolean;
  firstFoldHomeSectionsDelivered: boolean;
  homeDoesNotEraseWhileStagingExists: boolean;
};

const TEST_SOURCE_ID = 'smoke-home-empty-source';

export async function runHomeEmptyRegressionSmokeTest(): Promise<HomeEmptyRegressionSmokeTestResult> {
  const authorizedSource: AuthorizedIptvSource = {
    license: {
      id: 'license-smoke-123',
      code: 'XFLX-SMOKE',
      status: 'active',
      expiresAt: null,
    },
    device: {
      id: 'device-smoke-456',
      platform: 'smoke',
    },
    source: {
      id: TEST_SOURCE_ID,
      name: 'Lista IPTV Local',
      type: 'm3u',
      url: 'https://source.example.invalid/playlist.m3u',
    },
  };

  const staleMetadata: LocalCatalogImportMetadata = {
    sourceId: TEST_SOURCE_ID,
    sourceType: 'm3u',
    status: 'ready',
    startedAt: '2026-08-19T12:00:00.000Z',
    completedAt: '2026-08-19T12:05:00.000Z',
    lastSuccessfulImportAt: '2026-08-19T12:05:00.000Z',
    parsedCount: 3,
    importedCount: 3,
    updatedCount: 0,
    removedCount: 0,
    unknownCount: 0,
    withoutGroupCount: 0,
    classificationVersion: 1,
    errorCode: null,
  };

  const mockRepository: Pick<CatalogRepository, 'getImportMetadata'> = {
    getImportMetadata: async () => staleMetadata,
  };

  let startSourceImportCalled = false;
  const mockStagingSections: HomeVodSection[] = [
    {
      id: 'sec-1',
      title: 'Filmes em Destaque',
      eyebrow: 'Populares',
      description: 'Filmes em staging',
      items: [
        {
          id: 'item-1',
          title: 'Filme Staging 1',
          kind: 'movie',
          streamUrl: 'https://stream.invalid/1.mp4',
        },
      ],
    },
  ];

  const prepared = await prepareHomePlaylist(
    {
      licenseCode: 'XFLX-SMOKE',
      deviceIdentifier: 'device-smoke-456',
      currentChannelsCount: 0,
      currentStatus: 'idle',
      loadFromSource: async () => {
        // Fallback loader
      },
      startSourceImport: (): SourceImportTask => {
        startSourceImportCalled = true;
        return {
          dedupKey: 'dedup-smoke',
          sourceId: TEST_SOURCE_ID,
          scopeKey: 'scope-smoke-1',
          stagingSnapshotId: 'staging-snap-1',
          firstFoldReady: Promise.resolve({
            sourceId: TEST_SOURCE_ID,
            scopeKey: 'scope-smoke-1',
            snapshotId: 'staging-snap-1',
            readMode: 'staging',
            hasRenderableVodSections: true,
            homeSections: mockStagingSections,
          }),
          completion: Promise.resolve({
            channels: [],
            total: 0,
            diagnostics: {
              contentLength: 0,
              totalLines: 0,
              startsWithExtM3u: true,
              extinfLines: 0,
              playableUrlLines: 0,
              firstNonEmptyLine: '#EXTM3U',
            },
          }),
          abort: () => {},
        };
      },
      loadFromChannels: () => {},
      clearRuntime: () => {},
    },
    {
      getAuthorizedSource: async () => authorizedSource,
      repository: mockRepository,
      // Active snapshot is null because promotion is disabled (MVP-PRE-VS06 state)
      getActiveSnapshot: async () => null,
    },
  );

  const staleMetadataDidNotBypassImport = startSourceImportCalled;
  const firstFoldHydrationDispatched = prepared.firstFoldReadMode === 'staging';
  const firstFoldHomeSectionsDelivered =
    (prepared.firstFoldHomeSections?.length ?? 0) > 0 &&
    prepared.firstFoldHomeSections![0].items[0].title === 'Filme Staging 1';

  const homeDoesNotEraseWhileStagingExists =
    staleMetadataDidNotBypassImport &&
    firstFoldHydrationDispatched &&
    firstFoldHomeSectionsDelivered;

  const result: HomeEmptyRegressionSmokeTestResult = {
    ok:
      staleMetadataDidNotBypassImport &&
      firstFoldHydrationDispatched &&
      firstFoldHomeSectionsDelivered &&
      homeDoesNotEraseWhileStagingExists,
    staleMetadataDidNotBypassImport,
    firstFoldHydrationDispatched,
    firstFoldHomeSectionsDelivered,
    homeDoesNotEraseWhileStagingExists,
  };

  return result;
}
