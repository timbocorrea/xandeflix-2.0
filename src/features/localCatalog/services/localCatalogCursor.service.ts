import type { LocalCatalogPageCursor } from '../types/localCatalog.types';

type CursorPayload = {
  v: 1;
  snapshotId: string;
  filterKey: string;
  lastKey: string | number | Array<string | number>;
};

const MAX_CURSOR_LENGTH = 4_096;
const MAX_CURSOR_TEXT_LENGTH = 256;
const MAX_LAST_KEY_PARTS = 8;

function fail(): never {
  throw new Error('LOCAL_CATALOG_CURSOR_INVALID');
}

function isValidKeyPart(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value.length > 0 && value.length <= MAX_CURSOR_TEXT_LENGTH) ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isValidLastKey(value: unknown): value is CursorPayload['lastKey'] {
  return isValidKeyPart(value) || (
    Array.isArray(value) && value.length > 0 && value.length <= MAX_LAST_KEY_PARTS &&
    value.every(isValidKeyPart)
  );
}

function validatePayload(value: Partial<CursorPayload>): asserts value is CursorPayload {
  const keys = Object.keys(value).sort().join(',');
  if (
    keys !== 'filterKey,lastKey,snapshotId,v' || value.v !== 1 ||
    typeof value.snapshotId !== 'string' || value.snapshotId.length === 0 ||
    value.snapshotId.length > MAX_CURSOR_TEXT_LENGTH ||
    typeof value.filterKey !== 'string' || value.filterKey.length === 0 ||
    value.filterKey.length > MAX_CURSOR_TEXT_LENGTH || !isValidLastKey(value.lastKey)
  ) fail();
}

function encodeJson(json: string) {
  const bytes = new TextEncoder().encode(json);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

export function encodeLocalCatalogPageCursor(
  payload: Omit<CursorPayload, 'v'>,
): LocalCatalogPageCursor {
  const value: CursorPayload = { v: 1, ...payload };
  validatePayload(value);
  return encodeJson(JSON.stringify(value));
}

export function decodeLocalCatalogPageCursor(
  cursor: LocalCatalogPageCursor,
  expected: { snapshotId: string; filterKey: string },
): CursorPayload {
  try {
    if (!cursor || cursor.length > MAX_CURSOR_LENGTH) fail();
    const bytes = Uint8Array.from(atob(cursor), (character) => character.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    if (encodeJson(json) !== cursor) fail();
    const value = JSON.parse(json) as Partial<CursorPayload>;
    validatePayload(value);
    if (value.snapshotId !== expected.snapshotId || value.filterKey !== expected.filterKey) fail();
    return value;
  } catch {
    return fail();
  }
}
