import type { ListLocalCatalogItemsInput } from '../types/localCatalog.types';
import { localIndexedDbCatalogStorage } from '../storage/localIndexedDbCatalogStorage';
import type { LocalCatalogStorage } from '../storage/localCatalogStorage.types';
import type {
  CatalogRepository,
  CatalogRepositoryListItemsInput,
} from './catalogRepository.types';

function toStorageListInput(
  input: CatalogRepositoryListItemsInput = {},
): ListLocalCatalogItemsInput {
  const storageInput: ListLocalCatalogItemsInput = {};

  if (input.contentKind !== undefined) {
    storageInput.contentKind = input.contentKind;
  }

  if (input.groupTitle !== undefined && input.groupTitle !== null) {
    storageInput.groupTitle = input.groupTitle;
  }

  if (input.limit !== undefined) {
    storageInput.limit = input.limit;
  }

  if (input.offset !== undefined) {
    storageInput.offset = input.offset;
  }

  return storageInput;
}

export function createLocalCatalogRepository(
  storage: LocalCatalogStorage = localIndexedDbCatalogStorage,
): CatalogRepository {
  return {
    kind: 'local-indexeddb',
    getStats: () => storage.getStats(),
    listItems: (input = {}) => storage.listItems(toStorageListInput(input)),
  };
}

export const localCatalogRepository = createLocalCatalogRepository();
