# U2-F2 Cycle 2: IndexedDB contract

## Objective and limits

This cycle adds the version 3 storage contract required for scoped snapshots,
resumable imports, keyset pagination, and sanitized local search. It does not
activate snapshot ingestion, promotion, search, or new application read paths.

## Additive schema

The legacy `playlistItems`, `catalogMetadata`, and `tmdbMetadata` stores and
their indexes remain unchanged. Version 3 adds `catalogScopes`,
`importSnapshots`, `importCheckpoints`, `catalogSnapshotItems`,
`catalogSnapshotCategories`, `searchDocuments`, `searchTokens`, and
`catalogSnapshotMetrics`.

```text
opaque tenant scope + source
          |
      catalogScopes
       /         \
active snapshot  staging snapshot
       |              |
read-only clients   import/checkpoint/index construction
```

## Security policy

The tenant scope is opaque and must be derived in a later cycle from the stable
internal activation identifier, never from a raw access code. Scope access can
be marked signed out, revoked, or superseded while incrementing a runtime epoch.
Operational items may contain a playback URL. Search documents, tokens,
metrics, logs, and checkpoints must not contain playback or source URLs,
credentials, authorization material, or playlist payloads.

Storage key, logical identity, operational URL, and metadata association are
separate concepts. Logical identity prefers stable external identifiers and
uses an explicitly versioned URL fallback only when unavoidable.

The page cursor is opaque and strictly validated, but Base64 provides encoding,
not cryptographic integrity. A client that knows the format can construct a new
valid cursor; repositories must always validate its snapshot and filter scope.

## Rollout and rollback

The upgrade is additive and does not migrate real records. Existing readers and
writers continue using the version 2 stores. Connections close on
`versionchange`; blocked opens return a sanitized error code without retry.
Rollback consists of disabling new code paths while leaving legacy stores
intact. New stores must not be deleted until rollout is complete.

The internal structural smoke test can later be invoked from an authorized
diagnostic surface through `runLocalCatalogSchemaSmokeTest`; it uses synthetic
records and removes only its version 3 keys.

Selective removal is not a direct delete by `scopeKey`: it must first enumerate
the scope snapshots and then remove dependent records by `snapshotId`. The real
operation belongs to a later cycle and must be transactional or resumable.

## Risks and next step

Atomic promotion, staging cleanup, durable resumption, and selective scope
removal are contracts only. Cycle 3 must implement transactional snapshot
promotion, checkpoint validation, rollback to the last active snapshot, and
runtime-epoch checks before any new read path is enabled.
