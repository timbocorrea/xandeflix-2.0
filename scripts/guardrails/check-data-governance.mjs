#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const PROTECTED_ALLOWLIST = [
  'docs/product/',
  'docs/architecture/',
  'docs/governance/',
  'scripts/guardrails/',
  '.github/pull_request_template.md',
];

const FORBIDDEN_PATTERNS = [
  { id: 'license_channels_cache', pattern: /\blicense_channels_cache\b/i },
  { id: 'stream_url', pattern: /\bstream_url\b/i },
  { id: 'playlist_url', pattern: /\bplaylist_url\b/i },
  { id: 'group_title', pattern: /\bgroup_title\b/i },
  { id: 'tvg_id', pattern: /\btvg_id\b/i },
  { id: 'logo_url', pattern: /\blogo_url\b/i },
  { id: 'poster_path', pattern: /\bposter_path\b/i },
  { id: 'backdrop_path', pattern: /\bbackdrop_path\b/i },
  { id: 'tmdb_prefixed_field', pattern: /\btmdb_[a-z0-9_]*\b/i },
  { id: 'tmdb_catalog_enrichment_function', pattern: /enrich-license-channels-tmdb/i },
  { id: 'central_catalog_edge_function', pattern: /get-client-license-channels/i },
];

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

function isAllowedPath(filePath) {
  return PROTECTED_ALLOWLIST.some((allowedPath) => {
    if (allowedPath.endsWith('/')) {
      return filePath.startsWith(allowedPath);
    }

    return filePath === allowedPath;
  });
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
    ? ['diff', '--unified=0', '--diff-filter=ACMRTUXB', `${baseRef}...HEAD`, '--', filePath]
    : ['diff', '--unified=0', '--diff-filter=ACMRTUXB', '--cached', '--', filePath];

  return tryGit(args)
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

function scanFile(baseRef, filePath) {
  const addedLines = readAddedLines(baseRef, filePath);
  const violations = [];

  for (const [index, line] of addedLines.entries()) {
    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.pattern.test(line)) {
        violations.push({
          filePath,
          addedLineIndex: index + 1,
          rule: rule.id,
          line: line.trim(),
        });
      }
    }
  }

  return violations;
}

const baseRef = resolveBaseRef();
const changedFiles = listChangedFiles(baseRef);
const scannedFiles = changedFiles.filter((filePath) => !isAllowedPath(filePath));
const violations = scannedFiles.flatMap((filePath) => scanFile(baseRef, filePath));
const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const warningMode = process.env.DATA_GOVERNANCE_ALLOW_LEGACY === '1' && !isCi;

console.log('=== DATA GOVERNANCE CHECK ===');
console.log(`BASE_REF=${baseRef ?? 'UNAVAILABLE'}`);
console.log(`CHANGED_FILES=${changedFiles.length}`);
console.log(`SCANNED_FILES=${scannedFiles.length}`);
console.log(`IGNORED_PATHS=${PROTECTED_ALLOWLIST.join(', ')}`);
console.log(`WARNING_MODE=${warningMode ? 'ON' : 'OFF'}`);
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
  process.exit(0);
}

console.log('DATA_GOVERNANCE_RESULT=FAIL');
console.log('');
console.log('Forbidden local-first governance patterns were introduced outside the approved governance allowlist.');
console.log('Existing legacy may remain frozen, but new changes must not expand centralized IPTV/TMDB catalog behavior.');
console.log('');

for (const violation of violations) {
  console.log(`- file=${violation.filePath}`);
  console.log(`  rule=${violation.rule}`);
  console.log(`  added_line_index=${violation.addedLineIndex}`);
  console.log(`  line=${violation.line}`);
}

if (warningMode) {
  console.log('');
  console.log('DATA_GOVERNANCE_WARNING_ONLY=1');
  console.log('Local warning mode is enabled. CI still fails on these violations.');
  process.exit(0);
}

process.exit(1);
