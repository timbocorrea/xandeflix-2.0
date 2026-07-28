# U2-F2 Cycle 4A: bounded snapshot ingestion

## Objective and limits

This subcycle adds an opt-in snapshot importer without connecting it to the
legacy playlist runtime. Home, catalog pages, search, playback, Android, and
authentication remain unchanged.

## Pipeline

```text
authorized stream or bounded text
  -> progressive parser (collectChannels=false)
  -> bounded batch
  -> transform worker pool (default 2, maximum 4)
  -> one IndexedDB transaction per batch
  -> items + category deltas + metric deltas + checkpoint
  -> validating -> ready
  -> explicit promotion only
```

No growing catalog array or React state is used. Memory is limited to the
parser batch, bounded transform work, aggregate counters, and category deltas
for that batch. The importer reports peak batch, transform concurrency, and
in-memory item counts. Collected channel count is always zero.

## Atomic batches, categories, and metrics

Each batch transaction fences scope, epoch, staging pointer, and snapshot
status before writing. Deterministic item keys make `put`-equivalent replay
idempotent. Only newly inserted items affect category counts and content-kind
metrics. Duplicate records inside or across batches increment the aggregate
duplicate counter. The checkpoint is written last in the same transaction, so
it cannot advance when an item, category, or metric write aborts.

Categories use snapshot, content kind, and normalized group. Only categories
present in the current batch are read and updated; the catalog is never scanned.

## Replay from the beginning

When persisted staging and source evidence are compatible, parsing restarts at
the beginning and discards the confirmed prefix by source order. Network bytes
and parser work for that prefix are repeated, while IndexedDB items and metrics
are not. This is not HTTP Range resume and not parser-state restoration.

```text
NETWORK_RANGE_RESUME=NOT_ENABLED
PARSER_STATE_RESUME=NOT_ENABLED
```

Sources without adequate validators may require a full restart.

## Transport and native fallback

Readable streams are classified as `streaming`. Text input is classified as
`whole_text_fallback` and is inherently fully materialized. Known text above
the conservative limit is rejected with `LOCAL_CATALOG_STREAMING_REQUIRED`.
The existing native fallback remains unchanged and is not considered
memory-safe for large snapshots.

## Cancellation, failure, promotion, and rollback

Abort is checked before parsing work, transformation tasks, and every new batch
transaction. An already-started IndexedDB transaction may finish atomically;
no subsequent batch starts. Cancellation removes its checkpoint. Transient
failure preserves it according to the Cycle 3 policy. The previous active
snapshot remains visible until an explicit promotion call succeeds.

The browser smoke test covers 2,500 unique synthetic items, small batches,
duplicates, replay, cancellation, failed-batch rollback, explicit promotion,
and selective cleanup.

## Risks and Cycle 4B handoff

The production loader may fall back to whole text on native platforms. Cycle 4B
must explicitly select snapshot mode, pass source validators and runtime epoch,
surface transport classification, and retain the legacy runtime behavior until
physical-device gates pass.
