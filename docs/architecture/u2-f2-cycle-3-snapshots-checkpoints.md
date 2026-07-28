# U2-F2 Cycle 3: snapshots and checkpoints

## Objective and limits

Cycle 3 implements the persistent lifecycle for a staging catalog, monotonic
checkpoints, resume eligibility, and atomic promotion. It does not connect the
real downloader, parser, React runtime, catalog pages, search, or playback.

## State machine

```text
building -> validating -> ready -> active -> superseded
    |           |           |
    +---------> failed <-----+
    +---------> canceled <---+
```

Terminal snapshots cannot return to construction or become active. Every
transition is checked against an explicit allowlist and produces sanitized
error codes.

## Active and staging transactions

Beginning staging creates the snapshot, its zero checkpoint, and the staging
pointer in one IndexedDB transaction. The active pointer is not changed.
Promotion validates the scope fence and all snapshot ownership/status
invariants before scheduling writes in one transaction over `catalogScopes`,
`importSnapshots`, and `importCheckpoints`. It supersedes the prior active
snapshot, activates staging, clears the staging pointer, and removes the new
snapshot checkpoint atomically. Item stores are not deleted.

`runtimeEpoch` is checked inside the same transaction that mutates data. This
fences late writes from an older runtime, staging import, or access session.

## Monotonic checkpoints and resume decisions

Batch sequence, confirmed item count, and confirmed byte count cannot decrease.
Parser version, source revision, and available source validators must remain
compatible. Validator values are persisted as operational metadata but are not
returned by the resume decision or logged.

`resume_eligible` means only that a persistent building snapshot and compatible
checkpoint can be continued. HTTP Range download and real parser restoration
are not active in this cycle.

```text
NETWORK_RANGE_RESUME=NOT_ENABLED
REAL_PARSER_RESUME=NOT_ENABLED
```

Blocked access or an epoch mismatch returns `blocked`. Missing or inconsistent
staging, parser changes, source changes, or invalid checkpoints return
`restart_required`.

## Cancellation, failure, rollback, and cleanup

Cancellation removes its checkpoint and clears only its staging pointer. A
transient failure preserves its checkpoint for controlled diagnostics; a fatal
failure removes it and requires restart. Both preserve the active snapshot and
leave staged item data for later selective cleanup.

An aborted IndexedDB transaction leaves scope and snapshots unchanged. The
synthetic lifecycle smoke test verifies this property without a production
backdoor and removes only its reserved scope and snapshot keys. Future cleanup
must enumerate snapshots by scope and delete dependent records transactionally
or resumably.

## Risks and Cycle 4 handoff

Resume eligibility does not prove that a source supports byte ranges. Cycle 4
must connect the bounded streaming importer, propagate the runtime epoch into
every batch transaction, validate source continuity, and keep the existing
catalog active until promotion. No full catalog array should enter React state.
