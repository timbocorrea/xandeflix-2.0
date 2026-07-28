#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REFERENCE_ONLY_PATHS = [
  'AGENTS.md',
  'docs/product/',
  'docs/architecture/',
  'docs/governance/',
  'scripts/guardrails/',
  '.github/pull_request_template.md',
  'docs/security/security-lgpd-ciclo-3-gate-positive.md',
];

const BACKEND_RISK_PATHS = [
  /^supabase\/functions\//,
  /^supabase\/migrations\//,
];

const PROHIBITED_FUNCTION_PATHS = [
  {
    id: 'central_catalog_edge_function',
    pattern: /^supabase\/functions\/get-client-license-channels\//i,
  },
  {
    id: 'central_tmdb_enrichment_function',
    pattern: /^supabase\/functions\/enrich-license-channels-tmdb\//i,
  },
  {
    id: 'playlist_proxy',
    pattern: /^supabase\/functions\/playlist-proxy\//i,
  },
  {
    id: 'stream_proxy',
    pattern: /^supabase\/functions\/(?:stream-proxy|stream-relay|restream)\//i,
  },
  {
    id: 'server_side_catalog_import',
    pattern:
      /^supabase\/functions\/[^/]*import[^/]*(?:m3u|playlist|channels?|vod|series)[^/]*\//i,
  },
];

const GLOBAL_CENTRAL_DATA_PLANE_PATTERNS = [
  {
    id: 'central_catalog_edge_function',
    pattern: /\bget-client-license-channels\b/i,
  },
  {
    id: 'central_tmdb_enrichment_function',
    pattern: /\benrich-license-channels-tmdb\b/i,
  },
  {
    id: 'playlist_proxy',
    pattern:
      /(?:\/functions\/v1\/|supabase\/functions\/)playlist[-_]?proxy\b/i,
  },
  {
    id: 'stream_proxy',
    pattern:
      /(?:\/functions\/v1\/|supabase\/functions\/)(?:stream[-_]?(?:proxy|relay)|restream)\b/i,
  },
  {
    id: 'indexeddb_backend_sync',
    pattern:
      /^(?=.*\b(?:sync|upload|push|persist)\w*\b)(?=.*\b(?:indexeddb|local[-_\s]?catalog)\b)(?=.*\b(?:supabase|backend|server)\b).*$/i,
  },
];

const BACKEND_CENTRAL_DATA_PLANE_PATTERNS = [
  {
    id: 'central_catalog_cache',
    pattern: /\blicense_channels_cache\b/i,
  },
  {
    id: 'central_item_stream_url',
    pattern: /\bstream_url\b/i,
  },
  {
    id: 'central_playlist_url',
    pattern: /\bplaylist_url\b/i,
  },
  {
    id: 'central_catalog_metadata',
    pattern:
      /\b(?:group_title|tvg_id|logo_url|poster_path|backdrop_path|tmdb_[a-z0-9_]*)\b/i,
  },
  {
    id: 'backend_catalog_query',
    pattern:
      /\.from\(\s*['"](?:license_channels_cache|channels?|movies?|series|catalog(?:_items)?|playlist_items)['"]\s*\)/i,
  },
  {
    id: 'server_side_catalog_import',
    pattern:
      /\b(?:fetch|download|parse|import)\w*\b.*\b(?:m3u|playlist|channels?|vod|series)\b|\b(?:m3u|playlist|channels?|vod|series)\b.*\b(?:fetch|download|parse|import)\w*\b/i,
  },
  {
    id: 'backend_catalog_search',
    pattern:
      /\b(?:search|ilike|textsearch)\w*\b.*\b(?:channels?|movies?|series|catalog|playlist)\b|\b(?:channels?|movies?|series|catalog|playlist)\b.*\b(?:search|ilike|textsearch)\w*\b/i,
  },
];

const LEGACY_AUDIT_EXCLUSION_PATTERN =
  /^\s*([a-z_$][\w$]*)\s*=\s*\1\.neq\(\s*['"]entity['"]\s*,\s*['"]license_channels_cache['"]\s*\)\s*;?\s*$/i;

const LEGACY_CACHE_DROP_PATTERN =
  /\bdrop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?license_channels_cache\b/i;

const LEGACY_CACHE_EXPANSION_PATTERN =
  /\b(?:create|alter|insert|update|upsert|delete|merge|copy|execute|perform|grant|revoke|truncate)\b/i;

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(args) {
  try {
    return runGit(args);
  } catch {
    return '';
  }
}

function hasRef(ref) {
  return tryGit(['rev-parse', '--verify', ref]).length > 0;
}

function resolveBaseRef() {
  const githubBase = process.env.GITHUB_BASE_REF;

  if (githubBase && hasRef(`origin/${githubBase}`)) {
    return `origin/${githubBase}`;
  }

  if (hasRef('origin/main')) {
    return 'origin/main';
  }

  if (hasRef('main')) {
    return 'main';
  }

  if (hasRef('HEAD~1')) {
    return 'HEAD~1';
  }

  return null;
}

function matchesPathPrefix(filePath, configuredPath) {
  return configuredPath.endsWith('/')
    ? filePath.startsWith(configuredPath)
    : filePath === configuredPath;
}

export function isReferenceOnlyPath(filePath) {
  return REFERENCE_ONLY_PATHS.some((configuredPath) =>
    matchesPathPrefix(filePath, configuredPath),
  );
}

export function isBackendRiskPath(filePath) {
  return BACKEND_RISK_PATHS.some((pattern) => pattern.test(filePath));
}

export function isLegacyAuditExclusion(line) {
  return LEGACY_AUDIT_EXCLUSION_PATTERN.test(line);
}

export function isLegacyRemovalMigration(filePath, addedLines) {
  if (!/^supabase\/migrations\/[^/]+\.sql$/i.test(filePath)) {
    return false;
  }

  const addedContent = addedLines.join('\n');

  return (
    LEGACY_CACHE_DROP_PATTERN.test(addedContent) &&
    !LEGACY_CACHE_EXPANSION_PATTERN.test(addedContent)
  );
}

function createViolation(filePath, addedLineIndex, rule, line) {
  return {
    filePath,
    addedLineIndex,
    rule,
    line: line.trim(),
  };
}

export function analyzeAddedContent(filePath, addedLines) {
  if (isReferenceOnlyPath(filePath)) {
    return [];
  }

  if (isLegacyRemovalMigration(filePath, addedLines)) {
    return [];
  }

  const violations = [];
  const pathRule = PROHIBITED_FUNCTION_PATHS.find(({ pattern }) =>
    pattern.test(filePath),
  );

  if (pathRule && addedLines.length > 0) {
    violations.push(
      createViolation(filePath, 1, pathRule.id, `[path] ${filePath}`),
    );
  }

  for (const [index, line] of addedLines.entries()) {
    if (isLegacyAuditExclusion(line)) {
      continue;
    }

    for (const rule of GLOBAL_CENTRAL_DATA_PLANE_PATTERNS) {
      if (rule.pattern.test(line)) {
        violations.push(
          createViolation(filePath, index + 1, rule.id, line),
        );
      }
    }

    if (!isBackendRiskPath(filePath)) {
      continue;
    }

    for (const rule of BACKEND_CENTRAL_DATA_PLANE_PATTERNS) {
      if (rule.pattern.test(line)) {
        violations.push(
          createViolation(filePath, index + 1, rule.id, line),
        );
      }
    }
  }

  return violations;
}

function listChangedFiles(baseRef) {
  const args = baseRef
    ? ['diff', '--name-only', '--diff-filter=ACMRTUXB', `${baseRef}...HEAD`]
    : ['diff', '--name-only', '--diff-filter=ACMRTUXB', '--cached'];

  return tryGit(args)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function readAddedLines(baseRef, filePath) {
  const args = baseRef
    ? [
        'diff',
        '--unified=0',
        '--diff-filter=ACMRTUXB',
        `${baseRef}...HEAD`,
        '--',
        filePath,
      ]
    : [
        'diff',
        '--unified=0',
        '--diff-filter=ACMRTUXB',
        '--cached',
        '--',
        filePath,
      ];

  return tryGit(args)
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

function scanFile(baseRef, filePath) {
  return analyzeAddedContent(filePath, readAddedLines(baseRef, filePath));
}

export function runDataGovernanceCheck() {
  const baseRef = resolveBaseRef();
  const changedFiles = listChangedFiles(baseRef);
  const scannedFiles = changedFiles.filter(
    (filePath) => !isReferenceOnlyPath(filePath),
  );
  const violations = scannedFiles.flatMap((filePath) =>
    scanFile(baseRef, filePath),
  );

  console.log('=== DATA GOVERNANCE CHECK ===');
  console.log(`BASE_REF=${baseRef ?? 'UNAVAILABLE'}`);
  console.log(`CHANGED_FILES=${changedFiles.length}`);
  console.log(`SCANNED_FILES=${scannedFiles.length}`);
  console.log(`REFERENCE_ONLY_PATHS=${REFERENCE_ONLY_PATHS.join(', ')}`);
  console.log('CONTEXT_AWARE=ON');
  console.log('');

  if (changedFiles.length === 0) {
    console.log('No changed files detected.');
  }

  if (scannedFiles.length > 0) {
    console.log('Scanned files:');
    for (const filePath of scannedFiles) {
      console.log(`- ${filePath}`);
    }
    console.log('');
  }

  if (violations.length === 0) {
    console.log('DATA_GOVERNANCE_RESULT=PASS');
    return 0;
  }

  console.log('DATA_GOVERNANCE_RESULT=FAIL');
  console.log('');
  console.log(
    'A context-aware rule detected a new central IPTV Data Plane construction.',
  );
  console.log(
    'Local-only metadata and narrowly classified legacy removal remain permitted.',
  );
  console.log('');

  for (const violation of violations) {
    console.log(`- file=${violation.filePath}`);
    console.log(`  rule=${violation.rule}`);
    console.log(`  added_line_index=${violation.addedLineIndex}`);
    console.log(`  line=${violation.line}`);
  }

  return 1;
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  process.exit(runDataGovernanceCheck());
}
