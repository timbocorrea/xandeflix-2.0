import {
  LOCAL_CATALOG_V2_STORES,
  getLocalCatalogMetadata,
  openLocalCatalogDb,
  putLocalCatalogImportMetadata,
  putLocalCatalogMetadata,
} from './localCatalogDb.service';
import type { LocalCatalogImportMetadata } from '../types/localCatalog.types';
import { REPAIR_MIGRATION_METADATA_KEY } from './localCatalogRepairMigration.service';

export const SOURCE_BINDING_MIGRATION_KEY = 'xandeflix:source-binding-migration:v1';
export const SOURCE_ALIAS_METADATA_PREFIX = 'xandeflix:source-alias:';

const PLAYLIST_ITEMS_STORE_NAME = LOCAL_CATALOG_V2_STORES[0]; // 'playlistItems'

export type SourceBindingMigrationInput = {
  authorizedSourceId: string;
  licenseCode: string;
  deviceIdentifier: string;
};

export type SourceBindingMigrationResult = {
  ok: boolean;
  status: 'COMPLETED' | 'ALREADY_COMPLETED' | 'REPAIR_NOT_COMPLETED' | 'NO_ACTIVE_CATALOG' | 'FAILED';
  boundSourceId?: string;
  error?: string;
};

let migrationPromiseMap = new Map<string, Promise<SourceBindingMigrationResult>>();

function createScopeKey(licenseCode: string, deviceIdentifier: string) {
  return `${licenseCode.trim().toUpperCase()}::${deviceIdentifier.trim()}`;
}

export function sourceAliasMetadataKey(sourceId: string) {
  return `${SOURCE_ALIAS_METADATA_PREFIX}${sourceId.trim()}`;
}

export async function runLocalCatalogSourceBindingMigration({
  authorizedSourceId,
  licenseCode,
  deviceIdentifier,
}: SourceBindingMigrationInput): Promise<SourceBindingMigrationResult> {
  const normalizedSourceId = authorizedSourceId.trim();
  const normalizedLicenseCode = licenseCode.trim().toUpperCase();
  const normalizedDeviceIdentifier = deviceIdentifier.trim();

  if (!normalizedSourceId || !normalizedLicenseCode || !normalizedDeviceIdentifier) {
    return {
      ok: false,
      status: 'FAILED',
      error: 'INVALID_BINDING_INPUT',
    };
  }

  const scopeKey = createScopeKey(normalizedLicenseCode, normalizedDeviceIdentifier);
  const flightKey = `${scopeKey}::${normalizedSourceId}`;

  const existingFlight = migrationPromiseMap.get(flightKey);
  if (existingFlight) {
    return existingFlight;
  }

  const migrationPromise = (async (): Promise<SourceBindingMigrationResult> => {
    try {
      // 1. Check idempotency metadata
      const existingStatus = await getLocalCatalogMetadata(SOURCE_BINDING_MIGRATION_KEY);
      if (
        existingStatus?.value &&
        typeof existingStatus.value === 'object' &&
        (existingStatus.value as { status?: string }).status === 'COMPLETED' &&
        (existingStatus.value as { boundSourceId?: string }).boundSourceId === normalizedSourceId
      ) {
        return {
          ok: true,
          status: 'ALREADY_COMPLETED',
          boundSourceId: normalizedSourceId,
        };
      }

      // 2. Verify repair migration completeness
      const repairStatus = await getLocalCatalogMetadata(REPAIR_MIGRATION_METADATA_KEY);
      const isRepairCompleted =
        repairStatus?.value &&
        typeof repairStatus.value === 'object' &&
        (repairStatus.value as { status?: string }).status === 'COMPLETED';

      // 3. Open DB and count active local playlist items
      const db = await openLocalCatalogDb();
      let itemCount = 0;

      try {
        const tx = db.transaction([PLAYLIST_ITEMS_STORE_NAME], 'readonly');
        const countReq = tx.objectStore(PLAYLIST_ITEMS_STORE_NAME).count();
        itemCount = await new Promise<number>((resolve, reject) => {
          countReq.onsuccess = () => resolve(countReq.result);
          countReq.onerror = () => reject(countReq.error ?? new Error('COUNT_FAILED'));
        });
      } finally {
        db.close();
      }

      if (itemCount === 0) {
        return {
          ok: false,
          status: 'NO_ACTIVE_CATALOG',
          error: 'LOCAL_CATALOG_EMPTY',
        };
      }

      // 4. Create explicit source binding import metadata for target sourceId
      const importMetadata: LocalCatalogImportMetadata = {
        sourceId: normalizedSourceId,
        sourceType: 'm3u',
        status: 'ready',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        lastSuccessfulImportAt: new Date().toISOString(),
        parsedCount: itemCount,
        importedCount: itemCount,
        updatedCount: 0,
        removedCount: 0,
        unknownCount: 0,
        withoutGroupCount: 0,
        classificationVersion: 1,
        errorCode: null,
      };

      await putLocalCatalogImportMetadata(importMetadata);

      // 5. Register explicit versioned source alias mapping (source-default -> authorizedSourceId)
      const aliasKey = sourceAliasMetadataKey(normalizedSourceId);
      const now = new Date().toISOString();
      await putLocalCatalogMetadata({
        key: aliasKey,
        value: {
          aliasSourceId: 'source-default',
          targetSourceId: normalizedSourceId,
          scopeKey,
          isRepairCompleted: Boolean(isRepairCompleted),
          boundAt: now,
        },
        updatedAt: now,
      });

      // 6. Record idempotency metadata
      await putLocalCatalogMetadata({
        key: SOURCE_BINDING_MIGRATION_KEY,
        value: {
          status: 'COMPLETED',
          boundSourceId: normalizedSourceId,
          scopeKey,
          itemCount,
          migratedAt: now,
        },
        updatedAt: now,
      });

      return {
        ok: true,
        status: 'COMPLETED',
        boundSourceId: normalizedSourceId,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        status: 'FAILED',
        error: err instanceof Error ? err.message : 'SOURCE_BINDING_MIGRATION_FAILED',
      };
    } finally {
      migrationPromiseMap.delete(flightKey);
    }
  })();

  migrationPromiseMap.set(flightKey, migrationPromise);
  return migrationPromise;
}
