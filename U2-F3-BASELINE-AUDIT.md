# U2-F3 Baseline Audit Report
**Project:** Xandeflix 2.0
**Phase:** 1 â€” READ-ONLY Baseline Audit
**Date:** 2026-08-03
**Branch:** `feat/u2-f3-mobile-first-catalog-refresh`
**Base HEAD:** `a6815c8a8c99ada61891cb4b506baa47720f9883`

---

## 1. Executive Summary

This baseline audit documents the existing catalog loading, parsing, snapshot lifecycle, and bootstrap architecture in **Xandeflix 2.0**. The purpose of Cycle U2-F3 is to implement **Mobile-First Catalog Warm Start & Background Refresh**, ensuring that:
- On app launch, existing valid local catalog snapshots are rendered immediately (**Warm Start**), providing an instant Netflix-like opening without blocking the UI on slow mobile networks.
- Catalog updates occur asynchronously in the background (**Background Refresh**), streaming items into a staging snapshot and atomically promoting it upon completion.
- Instability or network cancellation during background refresh leaves the existing `active` snapshot untouched and fully functional.
- Strict Control Plane architectural contracts (`AGENTS.md` and `XANDEFLIX_ARCHITECTURE_CONTRACT.md`) remain 100% preserved (all IPTV catalog processing and playback remains strictly client-side local).

---

## 2. Pipeline Mapping

### A. Direct Source Transport & Progressive Streaming
1. `fetchPlaylistTransport({ sourceUrl, method, signal, conditionalHeaders })`
   - Location: `src/features/playlists/services/playlistTransport.service.ts`
   - Handles direct M3U stream retrieval from the provider endpoint via native `fetch` or Capacitor transport.
2. `parseM3uPlaylistProgressiveFromStream(stream, options)`
   - Location: `src/features/playlists/lib/parseM3uPlaylist.ts`
   - Reads chunks from `ReadableStream<Uint8Array>`, parses M3U lines progressively without loading whole files into RAM, and yields channel batches via `onChannelsBatch(channelBatch)`.

### B. Local Catalog Snapshot Lifecycle
1. `beginLocalCatalogImport({ sourceId, sourceType, signal })`
   - Location: `src/features/localCatalog/services/localCatalogSnapshotImport.service.ts`
2. `prepareLocalCatalogRuntimeSnapshotBridge(...)`
   - Location: `src/features/localCatalog/services/localCatalogRuntimeSnapshotBridge.service.ts`
   - Initializes a new `staging` snapshot entry in IndexedDB (`localCatalogDb.service.ts`).
3. Batch Processing: `snapshotBridge.writeBatch(channelBatch)`
   - Commits batch array into IndexedDB staging tables (`localCatalogSnapshotLifecycle.service.ts`).
4. Completion & Atomic Promotion:
   - `snapshotBridge.complete({ parsedItems })` -> marks snapshot status as `ready`.
   - `snapshotBridge.promote()` -> atomically promotes the `staging` snapshot to `active` status and updates metadata (`importedAt`, `itemCount`, `parsedCount`).

### C. Application Bootstrap Flow
1. `runAppBootstrap(...)`
   - Location: `src/features/bootstrap/services/appBootstrap.service.ts`
   - Resolves authorized source from Control Plane (`getAuthorizedIptvSource`).
   - Checks local catalog readability (`isLocalCatalogReadable(metadata)`).
   - If local catalog is readable: loads VOD/Home sections from local read models (`loadLocalCatalogHomeVodSections`).
   - If local catalog is NOT readable (cold start): awaits initial import before declaring Home ready.

---

## 3. Persistence Points & State Architecture

| Component | Storage Layer | Role / Responsibility |
| :--- | :--- | :--- |
| **Session Bootstrap Cache** | `localStorage` (`xandeflix:critical-bootstrap:v6`) | Caches critical Home VOD section structure for instant UI rendering during hot returns. |
| **Catalog Metadata** | IndexedDB (`local_catalog_metadata`) | Tracks `sourceId`, `importedAt`, `status` (`ready`/`building`), `itemCount`, `parsedCount`. |
| **Active/Staging Snapshots** | IndexedDB (`local_catalog_snapshots`, `local_catalog_items`) | Holds raw and classified catalog items with `snapshotId` and status (`active`, `staging`, `expired`). |
| **Discovery Read Models** | IndexedDB (`local_catalog_home_hero_snapshot`) | Pre-computed discovery snapshots for Home Hero carousel and VOD categories. |

---

## 4. Identified Architectural Gaps & Risks

1. **Network Sensitivity Gap:**
   - The app currently does not distinguish between Wi-Fi, Mobile Data (3G/4G/5G), and Offline states.
   - On slow mobile networks, performing a full blocking download causes long wait times on new installations or refresh.

2. **Refresh Policy Gap:**
   - There is no automated policy service deciding *when* to execute a full vs background refresh or when to serve stale local snapshots.

3. **Background Refresh Promotion:**
   - Background refresh must run asynchronously without blocking the UI main thread, using staging snapshot isolation and atomic promotion upon success.

---

## 5. Planned Implementation Modules (Phase 2)

1. **`src/features/network/services/networkMode.service.ts`**: Network awareness module (detects `wifi`, `mobile`, `unknown`, online/offline).
2. **`src/features/catalog/services/catalogRefreshPolicy.service.ts`**: Catalog refresh policy engine.
3. **`src/features/catalog/services/catalogBackgroundRefresh.service.ts`**: Background refresh orchestrator (non-blocking streaming into staging snapshot + atomic promotion).
4. **`src/features/catalog/services/catalogMetrics.service.ts`**: Observability & metrics collector (sanitized performance logs).
5. **Automated Test Suite**: `src/features/catalog/services/catalogRefreshSmokeTest.service.ts` and runner `scripts/run-catalog-refresh-smokes.mjs`.

---

## 6. Architectural Compliance Declaration

- `AGENTS_READ=SIM`
- `ARCHITECTURE_CONTRACT_READ=SIM`
- `CONTROL_PLANE_ONLY_PRESERVED=SIM`
- `CENTRAL_IPTV_CATALOG_INTRODUCED=NAO`
- `DEVICE_DIRECT_FETCH_PRESERVED=SIM`
- `DEVICE_DIRECT_PLAYBACK_PRESERVED=SIM`
