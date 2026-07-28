#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  analyzeAddedContent,
  isLegacyAuditExclusion,
  isLegacyRemovalMigration,
} from './check-data-governance.mjs';

const cases = [
  {
    id: 'SAFE_01_LOCAL_TMDB',
    expectedViolations: 0,
    filePath:
      'src/features/localCatalog/services/localCatalogArtwork.service.ts',
    lines: [
      'const metadata = { tmdb_id: result.id, poster_path: result.poster_path };',
    ],
  },
  {
    id: 'SAFE_02_LOCAL_TVG_ID',
    expectedViolations: 0,
    filePath: 'src/features/localCatalog/services/localCatalogDb.service.ts',
    lines: ['await localStore.put({ tvg_id: item.tvgId });'],
  },
  {
    id: 'SAFE_03_DROP_LEGACY_CACHE',
    expectedViolations: 0,
    filePath:
      'supabase/migrations/20990101000000_drop_license_channels_cache.sql',
    lines: [
      'BEGIN;',
      'LOCK TABLE public.license_channels_cache IN ACCESS EXCLUSIVE MODE;',
      'DROP TABLE public.license_channels_cache;',
      'COMMIT;',
    ],
    extraAssertion: ({ filePath, lines }) =>
      isLegacyRemovalMigration(filePath, lines) &&
      !isLegacyRemovalMigration(filePath, [
        ...lines,
        'CREATE TABLE public.central_catalog (stream_url text);',
      ]),
  },
  {
    id: 'SAFE_04_AUDIT_EXCLUDES_LEGACY_ENTITY',
    expectedViolations: 0,
    filePath: 'src/features/admin/services/adminAuditLogs.service.ts',
    lines: ["query = query.neq('entity', 'license_channels_cache');"],
    extraAssertion: ({ lines }) => isLegacyAuditExclusion(lines[0]),
  },
  {
    id: 'BLOCK_01_CENTRAL_CACHE',
    expectedViolations: 1,
    filePath:
      'supabase/migrations/20990101000000_create_license_channels_cache.sql',
    lines: [
      'CREATE TABLE public.license_channels_cache (stream_url text not null);',
    ],
  },
  {
    id: 'BLOCK_02_PLAYLIST_PROXY',
    expectedViolations: 1,
    filePath: 'supabase/functions/playlist-proxy/index.ts',
    lines: ['Deno.serve(async (request) => fetch(await request.text()));'],
  },
  {
    id: 'BLOCK_03_STREAM_PROXY',
    expectedViolations: 1,
    filePath: 'supabase/functions/stream-proxy/index.ts',
    lines: ['Deno.serve(async (request) => fetch(await request.text()));'],
  },
  {
    id: 'BLOCK_04_BACKEND_CATALOG',
    expectedViolations: 1,
    filePath: 'supabase/functions/search-catalog/index.ts',
    lines: [
      "const query = supabase.from('movies').select('*').textSearch('name', term);",
    ],
  },
  {
    id: 'BLOCK_05_SERVER_SIDE_IMPORT',
    expectedViolations: 1,
    filePath: 'supabase/functions/import-m3u/index.ts',
    lines: ['const imported = await fetchAndImportM3u(sourceUrl);'],
  },
];

for (const testCase of cases) {
  const violations = analyzeAddedContent(testCase.filePath, testCase.lines);

  assert.equal(
    violations.length >= testCase.expectedViolations,
    true,
    `${testCase.id}: expected at least ${testCase.expectedViolations} violation(s), got ${violations.length}`,
  );

  if (testCase.expectedViolations === 0) {
    assert.deepEqual(
      violations,
      [],
      `${testCase.id}: safe fixture must not be rejected`,
    );
  }

  if (testCase.extraAssertion) {
    assert.equal(
      testCase.extraAssertion(testCase),
      true,
      `${testCase.id}: contextual safe classifier was not used`,
    );
  }

  console.log(`${testCase.id}=PASS`);
}

console.log('DATA_GOVERNANCE_GUARDRAIL_TEST=PASS');
