#!/usr/bin/env node

/**
 * Xandeflix 2.0 - Mechanical Safety Barrier
 * Deterministic Self-Test Suite
 *
 * Verifies all barrier components in isolated temporary directories
 * without mutating canonical worktree, using ADB, or building applications.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateBaselineManifest,
  validateManifestStructure,
  validatePathsAgainstRules,
  checkSemanticDependencies,
  getGitInfo,
  getChangedEntries,
  getContentSha256OrDeleted,
  computeSha256,
} from './check-baseline.mjs';

import {
  acquireWriterLock,
  releaseWriterLock,
  getWriterLockStatus,
  getDefaultLockPath,
} from './writer-lock.mjs';

import {
  evaluateEsmChunkSemantics,
  verifyBundleFlags,
} from './verify-bundle-flags.mjs';

import {
  auditPhysicalEvidence,
} from './verify-physical-evidence.mjs';

import {
  runPreBuildGate,
} from './run-pre-build-gate.mjs';

function createTempDir(prefix = 'xandeflix-safety-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createRealGitFixture(prefix) {
  const tDir = createTempDir(prefix);
  execFileSync('git', ['init', '--quiet'], { cwd: tDir, stdio: 'ignore' });
  return tDir;
}

async function runTests() {
  const testResults = [];
  const tempDirs = [];

  function registerTemp(d) {
    tempDirs.push(d);
    return d;
  }

  function record(id, name, passed, details = '') {
    testResults.push({ id, name, passed, details });
    const mark = passed ? '[PASS]' : '[FAIL]';
    console.log(`${mark} ${id}: ${name}${details ? ` (${details})` : ''}`);
  }

  const realGit = getGitInfo();

  try {
    // ==========================================
    // TEST 1: Branch Mismatch must FAIL
    // ==========================================
    {
      const manifest = {
        gateId: 'TEST_GATE_1',
        expectedBranch: 'non-existent-feature-branch-99',
      };
      const res = validateBaselineManifest(manifest, { skipDiffCheck: true, mockChangedFiles: [] });
      const passed = !res.passed && res.errors.some((e) => e.includes('Branch mismatch'));
      record('TEST_01', 'Branch Mismatch Rejection', passed);
    }

    // ==========================================
    // TEST 2: HEAD Mismatch must FAIL
    // ==========================================
    {
      const manifest = {
        gateId: 'TEST_GATE_2',
        expectedHead: '0000000000000000000000000000000000000000',
      };
      const res = validateBaselineManifest(manifest, { skipDiffCheck: true, mockChangedFiles: [] });
      const passed = !res.passed && res.errors.some((e) => e.includes('HEAD commit mismatch'));
      record('TEST_02', 'HEAD Commit Mismatch Rejection', passed);
    }

    // ==========================================
    // TEST 3: Protected Path Violation must FAIL
    // ==========================================
    {
      const simulatedChanged = ['AGENTS.md', 'docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md'];
      const protectedPaths = ['AGENTS.md', 'docs/**'];
      const allowedPaths = ['scripts/safety/**'];
      const violations = validatePathsAgainstRules(simulatedChanged, allowedPaths, protectedPaths);
      const passed = (
        violations.length === 2 &&
        violations.every((v) => v.reason === 'PROTECTED_PATH_VIOLATION')
      );
      record('TEST_03', 'Protected Path Precedence Rejection', passed);
    }

    // ==========================================
    // TEST 4: Allowlisted Path Delta must PASS
    // ==========================================
    {
      const simulatedChanged = ['scripts/safety/check-baseline.mjs', 'scripts/safety/writer-lock.mjs'];
      const protectedPaths = ['AGENTS.md', 'docs/**'];
      const allowedPaths = ['scripts/safety/**', 'package.json'];
      const violations = validatePathsAgainstRules(simulatedChanged, allowedPaths, protectedPaths);
      const passed = violations.length === 0;
      record('TEST_04', 'Allowlisted Path Validation', passed);
    }

    // ==========================================
    // TEST 5: Dependency Delta vs Scripts Delta
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('dep-test-'));
      const pkgPath = join(tDir, 'package.json');

      const baselineDependencies = { react: '^18.2.0' };
      const baselineDevDependencies = { vite: '^5.0.0' };

      // Case 5A: Dependency added/mutated -> FAIL
      writeFileSync(pkgPath, JSON.stringify({
        name: 'test-app',
        dependencies: { react: '^19.0.0', lodash: '^4.17.21' },
        devDependencies: { vite: '^5.0.0' },
      }), 'utf8');
      const failRes = checkSemanticDependencies(pkgPath, baselineDependencies, baselineDevDependencies);

      // Case 5B: Only scripts modified -> PASS
      writeFileSync(pkgPath, JSON.stringify({
        name: 'test-app',
        scripts: { 'safety:test': 'node test.mjs', 'new:tool': 'echo 1' },
        dependencies: { react: '^18.2.0' },
        devDependencies: { vite: '^5.0.0' },
      }), 'utf8');
      const passRes = checkSemanticDependencies(pkgPath, baselineDependencies, baselineDevDependencies);

      const passed = (!failRes.passed && failRes.mismatches.length > 0) && (passRes.passed && passRes.mismatches.length === 0);
      record('TEST_05', 'Semantic Dependency Guard Isolation', passed);
    }

    // ==========================================
    // TEST 6: Semantic Flag False when True Expected must FAIL
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('chunk-test-'));
      const chunkPath = join(tDir, 'env-false.js');

      writeFileSync(chunkPath, `
        export const envConfig = {
          localCatalogSnapshotImportEnabled: false,
          localCatalogSnapshotPromotionEnabled: false
        };
      `, 'utf8');

      const evalRes = evaluateEsmChunkSemantics(chunkPath);
      const passed = (
        evalRes.success &&
        evalRes.flags.snapshotImport === false &&
        evalRes.flags.snapshotPromotion === false
      );
      record('TEST_06', 'Semantic Flag Evaluation (Import False)', passed);
    }

    // ==========================================
    // TEST 7: B.6E Substring False-Positive Regression must FAIL
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('b6e-test-'));
      const chunkPath = join(tDir, 'env-b6e-minified.js');

      // Simulates exact minification artifact from Incident B.6E
      writeFileSync(chunkPath, `
        var t = false;
        var p = false;
        export const u2 = {
          localCatalogSnapshotImportEnabled: t,
          localCatalogSnapshotPromotionEnabled: p
        };
      `, 'utf8');

      const evalRes = evaluateEsmChunkSemantics(chunkPath);
      const verifyRes = verifyBundleFlags({
        distEnvChunk: chunkPath,
        expectedImport: true, // Expect true, but runtime value is false!
        expectedPromotion: false,
      });

      const passed = (
        evalRes.success &&
        evalRes.flags.snapshotImport === false && // Correctly extracted false despite property name existing
        !verifyRes.passed && // Correctly rejected
        verifyRes.errors.some((e) => e.includes('semantic flag mismatch'))
      );
      record('TEST_07', 'Incident B.6E Substring False-Positive Rejection', passed);
    }

    // ==========================================
    // TEST 8: Triple Chunk Hash Mismatch must FAIL
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('triple-test-'));
      const distChunk = join(tDir, 'env-dist.js');
      const androidChunk = join(tDir, 'env-android.js');

      writeFileSync(distChunk, 'export const c = { localCatalogSnapshotImportEnabled: true, localCatalogSnapshotPromotionEnabled: false }; // v1', 'utf8');
      writeFileSync(androidChunk, 'export const c = { localCatalogSnapshotImportEnabled: true, localCatalogSnapshotPromotionEnabled: false }; // v2-drift', 'utf8');

      const verifyRes = verifyBundleFlags({
        distEnvChunk: distChunk,
        androidEnvChunk: androidChunk,
        expectedImport: true,
        expectedPromotion: false,
      });

      const passed = (
        !verifyRes.passed &&
        verifyRes.tripleByteIdentity === false &&
        verifyRes.errors.some((e) => e.includes('hash mismatch'))
      );
      record('TEST_08', 'Triple Chunk Identity Hash Mismatch Detection', passed);
    }

    // ==========================================
    // TEST 9: Physical Evidence Marker Missing must FAIL, Valid must PASS
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('evidence-test-'));
      const badLog = join(tDir, 'log-bad.txt');
      const goodLog = join(tDir, 'log-good.txt');

      writeFileSync(badLog, `
08-19 09:13:08.159  8356  8356 I XANDEFLIX_B6F4F: SOME_OTHER_MARKER
08-19 09:13:54.958  8512  8654 I XANDEFLIX_E8_DIAG: event=CONFIG_FLAGS snapshotImportEnabled=true snapshotPromotionEnabled=false
      `, 'utf8');

      writeFileSync(goodLog, `
08-19 09:13:08.159  8356  8356 I XANDEFLIX_B6F4F: CAPTURE_PREFLIGHT
08-19 09:13:31.335  8442  8442 I XANDEFLIX_B6F4F: B6F4F_PM_CLEAR_COMPLETE
08-19 09:13:54.958  8512  8654 I XANDEFLIX_E8_DIAG: event=CONFIG_FLAGS snapshotImportEnabled=true snapshotPromotionEnabled=false
08-19 09:14:34.072  8512  8654 I XANDEFLIX_E8_DIAG: event=FIRST_FOLD_READY_EMITTED elapsedMs=7214 hasRenderableVodSections=true atEof=false readMode=staging
      `, 'utf8');

      const badAudit = auditPhysicalEvidence({
        logPath: badLog,
        requiredMarkers: ['CAPTURE_PREFLIGHT', 'FIRST_FOLD_READY_EMITTED'],
      });

      const goodAudit = auditPhysicalEvidence({
        logPath: goodLog,
        requiredMarkers: ['CAPTURE_PREFLIGHT', 'FIRST_FOLD_READY_EMITTED'],
        requiredRuntimeFlags: { snapshotImportEnabled: true, snapshotPromotionEnabled: false },
        orderedMarkerSequences: [['CAPTURE_PREFLIGHT', 'FIRST_FOLD_READY_EMITTED']],
      });

      const passed = !badAudit.passed && goodAudit.passed;
      record('TEST_09', 'Physical Evidence Provenance & Marker Audit', passed);
    }

    // ==========================================
    // TEST 10: Hard Stop Prevents Subsequent Command
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('hardstop-test-'));
      const markerA = join(tDir, 'marker-a.txt');
      const markerC = join(tDir, 'marker-c.txt');
      const manifestPath = join(tDir, 'manifest.json');
      const reportPath = join(tDir, 'report.json');
      const worktreeBaseline = getChangedEntries(realGit.toplevel).map((entry) => ({
        ...entry,
        contentSha256: getContentSha256OrDeleted(realGit.toplevel, entry.path),
        mutationPolicy: 'frozen',
      }));

      const manifest = {
        gateId: 'TEST_HARD_STOP_GATE',
        expectedBranch: realGit.branch,
        expectedHead: realGit.head,
        worktreeBaseline,
        reportPath,
        targetedCommands: [
          {
            name: 'Step_A_Pass',
            command: process.execPath,
            args: ['-e', `import('node:fs').then(fs => fs.writeFileSync(${JSON.stringify(markerA)}, 'A'))`],
          },
          {
            name: 'Step_B_Fail',
            command: process.execPath,
            args: ['-e', 'process.exit(42)'],
          },
          {
            name: 'Step_C_MustNotRun',
            command: process.execPath,
            args: ['-e', `import('node:fs').then(fs => fs.writeFileSync(${JSON.stringify(markerC)}, 'C'))`],
          },
        ],
      };

      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const report = runPreBuildGate({ manifestPath, writer: 'TEST_RUNNER', skipLock: true });

      const stepAExecuted = existsSync(markerA);
      const stepCExecuted = existsSync(markerC);

      const passed = (
        report.result === 'FAIL_STEP' &&
        report.failedStep === 'Step_B_Fail' &&
        stepAExecuted === true &&
        stepCExecuted === false &&
        report.steps.length === 2
      );
      record('TEST_10', 'Hard Stop Execution Pipeline Abort', passed, `Step C Executed=${stepCExecuted}`);
    }

    // ==========================================
    // TEST 11: Writer Lock Conflict & Safe Release
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('lock-test-'));
      const lockPath = join(tDir, '.test-writer.lock');

      // 1. Acquire A
      const acqA = acquireWriterLock({ gateId: 'GATE_X', writer: 'AGENT_A', lockPath });
      // 2. Acquire B (must fail with conflict)
      const acqB = acquireWriterLock({ gateId: 'GATE_Y', writer: 'AGENT_B', lockPath });
      // 3. Release with wrong identity (must fail)
      const relWrong = releaseWriterLock({ gateId: 'GATE_X', writer: 'IMPOSTOR', lockPath });
      // 4. Release with correct identity (must pass)
      const relCorrect = releaseWriterLock({ gateId: 'GATE_X', writer: 'AGENT_A', lockPath });
      // 5. Check status after release
      const statusAfter = getWriterLockStatus(lockPath);

      const passed = (
        acqA.success === true &&
        acqB.success === false &&
        acqB.conflict === true &&
        relWrong.success === false &&
        relCorrect.success === true &&
        statusAfter.locked === false
      );
      record('TEST_11', 'Single-Writer Lock Atomic Coordination', passed);
    }

    // ==========================================
    // TEST 12: Frozen Dirty Baseline Mutation must FAIL
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('dirty-frozen-test-'));
      const filePath = join(tDir, 'dirty.txt');
      writeFileSync(filePath, 'X', 'utf8');
      const hashX = computeSha256(filePath);
      const mockGit = { toplevel: tDir, branch: 'fixture-branch', head: 'fixture-head' };
      const manifest = {
        gateId: 'TEST_DIRTY_FROZEN',
        expectedBranch: mockGit.branch,
        expectedHead: mockGit.head,
        allowedPaths: ['dirty.txt'],
        worktreeBaseline: [{ path: 'dirty.txt', status: ' M', contentSha256: hashX, mutationPolicy: 'frozen' }],
      };
      const pre = validateBaselineManifest(manifest, {
        cwd: tDir,
        mockGitInfo: mockGit,
        skipDiffCheck: true,
        mockChangedEntries: [{ path: 'dirty.txt', status: ' M', contentSha256: hashX }],
      });
      writeFileSync(filePath, 'Y', 'utf8');
      const postMutation = validateBaselineManifest(manifest, {
        cwd: tDir,
        mockGitInfo: mockGit,
        skipDiffCheck: true,
        mockChangedEntries: [{ path: 'dirty.txt', status: ' M', contentSha256: computeSha256(filePath) }],
      });
      const passed = pre.passed && !postMutation.passed && postMutation.errors.some((error) => error.includes('FROZEN_BASELINE=FAIL'));
      record('TEST_12', 'Frozen Dirty Baseline Mutation Rejection', passed);
    }

    // ==========================================
    // TEST 13: Mutable Dirty Baseline Pre/Post Policy
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('dirty-mutable-test-'));
      const filePath = join(tDir, 'dirty.txt');
      writeFileSync(filePath, 'X', 'utf8');
      const hashX = computeSha256(filePath);
      const mockGit = { toplevel: tDir, branch: 'fixture-branch', head: 'fixture-head' };
      const manifest = {
        gateId: 'TEST_DIRTY_MUTABLE',
        expectedBranch: mockGit.branch,
        expectedHead: mockGit.head,
        allowedPaths: ['dirty.txt'],
        worktreeBaseline: [{ path: 'dirty.txt', status: ' M', contentSha256: hashX, mutationPolicy: 'mutable' }],
      };
      const pre = validateBaselineManifest(manifest, {
        cwd: tDir,
        phase: 'pre',
        mockGitInfo: mockGit,
        skipDiffCheck: true,
        mockChangedEntries: [{ path: 'dirty.txt', status: ' M', contentSha256: hashX }],
      });
      writeFileSync(filePath, 'Y', 'utf8');
      const post = validateBaselineManifest(manifest, {
        cwd: tDir,
        phase: 'post',
        mockGitInfo: mockGit,
        skipDiffCheck: true,
        mockChangedEntries: [{ path: 'dirty.txt', status: ' M', contentSha256: computeSha256(filePath) }],
      });
      const disallowed = validateBaselineManifest({ ...manifest, allowedPaths: ['other.txt'] }, {
        cwd: tDir,
        phase: 'post',
        mockGitInfo: mockGit,
        skipDiffCheck: true,
        mockChangedEntries: [{ path: 'dirty.txt', status: ' M', contentSha256: computeSha256(filePath) }],
      });
      const passed = pre.passed && post.passed && !disallowed.passed;
      record('TEST_13', 'Mutable Dirty Baseline Pre/Post Opt-In', passed);
    }

    // ==========================================
    // TEST 14: Dirty Baseline Full Coverage must FAIL
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('dirty-coverage-test-'));
      const fileA = join(tDir, 'a.txt');
      const fileB = join(tDir, 'b.txt');
      writeFileSync(fileA, 'A', 'utf8');
      writeFileSync(fileB, 'B', 'utf8');
      const mockGit = { toplevel: tDir, branch: 'fixture-branch', head: 'fixture-head' };
      const result = validateBaselineManifest({
        gateId: 'TEST_DIRTY_COVERAGE',
        expectedBranch: mockGit.branch,
        expectedHead: mockGit.head,
        worktreeBaseline: [{ path: 'a.txt', status: ' M', contentSha256: computeSha256(fileA), mutationPolicy: 'frozen' }],
      }, {
        cwd: tDir,
        mockGitInfo: mockGit,
        skipDiffCheck: true,
        mockChangedEntries: [
          { path: 'a.txt', status: ' M', contentSha256: computeSha256(fileA) },
          { path: 'b.txt', status: ' M', contentSha256: computeSha256(fileB) },
        ],
      });
      record('TEST_14', 'Dirty Baseline Complete Coverage Enforcement', !result.passed && result.errors.some((error) => error.includes('DIRTY_BASELINE_COVERAGE=FAIL')));
    }

    // ==========================================
    // TEST 15: External Writer Lock must not dirty canonical
    // ==========================================
    {
      const before = getChangedEntries(realGit.toplevel).map((entry) => `${entry.status}:${entry.path}`).sort();
      const lockPath = getDefaultLockPath(realGit.toplevel);
      const acquired = acquireWriterLock({ gateId: 'TEST_EXTERNAL_LOCK', writer: 'TEST_RUNNER', worktree: realGit.toplevel });
      const during = getChangedEntries(realGit.toplevel).map((entry) => `${entry.status}:${entry.path}`).sort();
      const released = releaseWriterLock({ gateId: 'TEST_EXTERNAL_LOCK', writer: 'TEST_RUNNER', worktree: realGit.toplevel });
      const passed = acquired.success && released.success && !lockPath.toLowerCase().startsWith(realGit.toplevel.toLowerCase()) && JSON.stringify(before) === JSON.stringify(during);
      record('TEST_15', 'External Writer Lock Canonical Status Isolation', passed);
    }

    // ==========================================
    // TEST 16: Runtime Manifest Validation must FAIL invalid input
    // ==========================================
    {
      const valid = validateManifestStructure({
        gateId: 'VALID_MANIFEST',
        allowedPaths: ['scripts/safety/**'],
        worktreeBaseline: [{ path: 'a.txt', status: ' M', contentSha256: 'A'.repeat(64), mutationPolicy: 'frozen' }],
        physicalEvidenceRequirements: {
          requiredMarkers: ['A'],
          orderedMarkerSequences: [['A']],
          requiredRuntimeFlags: { snapshotImportEnabled: true, snapshotPromotionEnabled: false },
        },
        artifactRequirements: {
          expectedApkSha256: 'B'.repeat(64),
          expectedApkSizeBytes: 1,
        },
      });
      const structure = validateManifestStructure({ gateId: 42, worktreeBaseline: [{ path: 'a', status: ' M', contentSha256: 'bad', mutationPolicy: 'sometimes' }] });
      const result = validateBaselineManifest({ gateId: 42 }, { skipDiffCheck: true, mockChangedEntries: [] });
      const passed = valid.valid && !structure.valid && !result.passed;
      record('TEST_16', 'Runtime Manifest Structural Validation', passed);
    }

    // ==========================================
    // TEST 17: Maximum Timestamp must FAIL late evidence
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('max-timestamp-test-'));
      const logPath = join(tDir, 'late.log');
      writeFileSync(logPath, '08-19 10:00:00.000  1  1 I TEST: MARKER\n', 'utf8');
      const result = auditPhysicalEvidence({ logPath, requiredMarkers: ['MARKER'], maximumTimestamp: '08-19 09:00:00.000' });
      record('TEST_17', 'Maximum Timestamp Enforcement', !result.passed && result.errors.some((error) => error.includes('maximum timestamp')));
    }

    // ==========================================
    // TEST 18: Presence does not imply marker order
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('ordered-markers-test-'));
      const logPath = join(tDir, 'markers.log');
      writeFileSync(logPath, [
        '08-19 09:00:00.000  1  1 I TEST: FIRST',
        '08-19 09:00:01.000  1  1 I TEST: SECOND',
      ].join('\n'), 'utf8');
      const presenceOnly = auditPhysicalEvidence({ logPath, requiredMarkers: ['SECOND', 'FIRST'] });
      const orderedFailure = auditPhysicalEvidence({ logPath, requiredMarkers: ['SECOND', 'FIRST'], orderedMarkerSequences: [['SECOND', 'FIRST']] });
      record('TEST_18', 'Explicit Ordered Marker Sequences', presenceOnly.passed && !orderedFailure.passed);
    }

    // ==========================================
    // TEST 19: APK Identity mismatch must FAIL before flags
    // ==========================================
    {
      const tDir = registerTemp(createTempDir('apk-identity-test-'));
      const chunkPath = join(tDir, 'env-test.js');
      const apkPath = join(tDir, 'fake.apk');
      writeFileSync(chunkPath, 'export const env = { localCatalogSnapshotImportEnabled: true, localCatalogSnapshotPromotionEnabled: false };', 'utf8');
      writeFileSync(apkPath, 'not-an-apk', 'utf8');
      const result = verifyBundleFlags({
        distEnvChunk: chunkPath,
        apkPath,
        expectedImport: true,
        expectedPromotion: false,
        expectedApkSha256: '0'.repeat(64),
        expectedApkSizeBytes: 999,
      });
      record('TEST_19', 'APK File Identity Enforcement', !result.passed && result.errors.some((error) => error.includes('APK SHA256 mismatch')));
    }

    // ==========================================
    // TEST 20: Untracked directory content freeze must FAIL after mutation
    // ==========================================
    {
      const tDir = registerTemp(createRealGitFixture('untracked-directory-freeze-test-'));
      const dir = join(tDir, 'untracked-dir');
      const fileA = join(dir, 'a.txt');
      const fileB = join(dir, 'b.txt');
      mkdirSync(dir, { recursive: true });
      writeFileSync(fileA, 'X', 'utf8');
      writeFileSync(fileB, 'Y', 'utf8');

      const initialEntries = getChangedEntries(tDir);
      const baselineEntries = initialEntries.map((entry) => ({
        ...entry,
        contentSha256: getContentSha256OrDeleted(tDir, entry.path),
        mutationPolicy: 'frozen',
      }));
      const mockGit = { toplevel: tDir, branch: 'fixture-branch', head: 'fixture-head' };
      const manifest = {
        gateId: 'TEST_UNTRACKED_DIRECTORY_FREEZE',
        expectedBranch: mockGit.branch,
        expectedHead: mockGit.head,
        worktreeBaseline: baselineEntries,
      };
      const pre = validateBaselineManifest(manifest, {
        cwd: tDir,
        mockGitInfo: mockGit,
        skipDiffCheck: true,
      });
      writeFileSync(fileA, 'Z', 'utf8');
      const post = validateBaselineManifest(manifest, {
        cwd: tDir,
        mockGitInfo: mockGit,
        skipDiffCheck: true,
        phase: 'post',
      });
      const paths = initialEntries.map((entry) => entry.path).sort();
      const passed = (
        pre.passed &&
        paths.join('|') === 'untracked-dir/a.txt|untracked-dir/b.txt' &&
        initialEntries.every((entry) => entry.status === '??' && entry.path !== 'untracked-dir') &&
        baselineEntries.every((entry) => /^[A-F0-9]{64}$/.test(entry.contentSha256)) &&
        !post.passed &&
        post.errors.some((error) => error.includes('FROZEN_BASELINE=FAIL'))
      );
      record('TEST_20', 'Untracked Directory Content Freeze', passed);
    }

    // ==========================================
    // TEST 21: New file inside untracked directory must not be hidden
    // ==========================================
    {
      const tDir = registerTemp(createRealGitFixture('untracked-directory-coverage-test-'));
      const dir = join(tDir, 'untracked-dir');
      const fileA = join(dir, 'a.txt');
      const fileB = join(dir, 'new.txt');
      mkdirSync(dir, { recursive: true });
      writeFileSync(fileA, 'A', 'utf8');

      const initialEntries = getChangedEntries(tDir);
      const mockGit = { toplevel: tDir, branch: 'fixture-branch', head: 'fixture-head' };
      const manifest = {
        gateId: 'TEST_UNTRACKED_DIRECTORY_COVERAGE',
        expectedBranch: mockGit.branch,
        expectedHead: mockGit.head,
        allowedPaths: ['untracked-dir/a.txt'],
        worktreeBaseline: initialEntries.map((entry) => ({
          ...entry,
          contentSha256: getContentSha256OrDeleted(tDir, entry.path),
          mutationPolicy: 'frozen',
        })),
      };
      const pre = validateBaselineManifest(manifest, {
        cwd: tDir,
        mockGitInfo: mockGit,
        skipDiffCheck: true,
      });
      writeFileSync(fileB, 'B', 'utf8');
      const post = validateBaselineManifest(manifest, {
        cwd: tDir,
        mockGitInfo: mockGit,
        skipDiffCheck: true,
        phase: 'post',
      });
      const currentPaths = post.details.changedFiles || [];
      const passed = (
        pre.passed &&
        currentPaths.includes('untracked-dir/a.txt') &&
        currentPaths.includes('untracked-dir/new.txt') &&
        !currentPaths.includes('untracked-dir') &&
        !post.passed &&
        post.errors.some((error) => error.includes('UNAUTHORIZED_PATH_DELTA'))
      );
      record('TEST_21', 'Untracked Directory New-File Coverage', passed);
    }

    // ==========================================
    // TEST 22: Untracked path with spaces preserves path and hash
    // ==========================================
    {
      const tDir = registerTemp(createRealGitFixture('untracked-path-spaces-test-'));
      const dir = join(tDir, 'untracked-dir');
      const filePath = join(dir, 'file with spaces.txt');
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, 'spaces-content', 'utf8');

      const entries = getChangedEntries(tDir);
      const entry = entries.find((candidate) => candidate.path === 'untracked-dir/file with spaces.txt');
      const passed = (
        entries.length === 1 &&
        entry?.status === '??' &&
        entry.path === 'untracked-dir/file with spaces.txt' &&
        getContentSha256OrDeleted(tDir, entry.path) === computeSha256(filePath)
      );
      record('TEST_22', 'Untracked Path With Spaces Integrity', passed);
    }

    // ==========================================
    // TEST 23: STANDARD gate cannot allow canonical paths
    // ==========================================
    {
      const result = validateBaselineManifest({
        gateId: 'TEST_STANDARD_CANONICAL_REJECTION',
        gateType: 'STANDARD',
        allowedPaths: [
          'AGENTS.md',
          'docs/FSD.md',
          'docs/STATUS.md',
        ],
      }, {
        skipDiffCheck: true,
        mockChangedEntries: [],
      });

      const violations = result.errors.filter(
        (error) =>
          error.includes(
            'STANDARD_GATE_CANNOT_ALLOW_CANONICAL_PATH'
          )
      );

      record(
        'TEST_23',
        'Standard Gate Canonical Contract Rejection',
        !result.passed && violations.length === 3
      );
    }

    // ==========================================
    // TEST 24: Amendment requires Chat Mestre authorization
    // ==========================================
    {
      const result = validateBaselineManifest({
        gateId: 'TEST_CANONICAL_AUTH_REQUIRED',
        gateType: 'CANONICAL_AMENDMENT',
        allowedPaths: ['docs/FSD.md'],
      }, {
        skipDiffCheck: true,
        mockChangedEntries: [],
      });

      record(
        'TEST_24',
        'Canonical Amendment Requires Master Authorization',
        !result.passed &&
        result.errors.some(
          (error) =>
            error.includes(
              'masterAuthorization is required'
            )
        )
      );
    }

    // ==========================================
    // TEST 25: Authorized canonical amendment can mutate Tier 1
    // ==========================================
    {
      const initialHash = 'A'.repeat(64);
      const changedHash = 'B'.repeat(64);

      const manifest = {
        gateId: 'TEST_CANONICAL_AMENDMENT_ALLOWED',
        gateType: 'CANONICAL_AMENDMENT',
        masterAuthorization: {
          authority: 'CHAT_MASTER',
          decisionRef: 'TEST-DECISION-25',
        },
        allowedPaths: ['docs/FSD.md'],
        worktreeBaseline: [{
          path: 'docs/FSD.md',
          status: ' M',
          contentSha256: initialHash,
          mutationPolicy: 'mutable',
        }],
      };

      const mockGit = {
        toplevel: realGit.toplevel,
        branch: realGit.branch,
        head: realGit.head,
      };

      const pre = validateBaselineManifest(
        manifest,
        {
          mockGitInfo: mockGit,
          skipDiffCheck: true,
          phase: 'pre',
          mockChangedEntries: [{
            path: 'docs/FSD.md',
            status: ' M',
            contentSha256: initialHash,
          }],
        }
      );

      const post = validateBaselineManifest(
        manifest,
        {
          mockGitInfo: mockGit,
          skipDiffCheck: true,
          phase: 'post',
          mockChangedEntries: [{
            path: 'docs/FSD.md',
            status: ' M',
            contentSha256: changedHash,
          }],
        }
      );

      record(
        'TEST_25',
        'Authorized Canonical Amendment Tier 1 Mutation',
        pre.passed && post.passed
      );
    }

    // ==========================================
    // TEST 26: Canonical amendment cannot mix product code
    // ==========================================
    {
      const result = validateBaselineManifest({
        gateId: 'TEST_CANONICAL_PRODUCT_MIX_REJECTION',
        gateType: 'CANONICAL_AMENDMENT',
        masterAuthorization: {
          authority: 'CHAT_MASTER',
          decisionRef: 'TEST-DECISION-26',
        },
        allowedPaths: [
          'docs/FSD.md',
          'src/features/catalog/pages/CatalogPage.tsx',
        ],
      }, {
        skipDiffCheck: true,
        mockChangedEntries: [],
      });

      record(
        'TEST_26',
        'Canonical Amendment Product-Code Mixing Rejection',
        !result.passed &&
        result.errors.some(
          (error) =>
            error.includes(
              'CANONICAL_AMENDMENT_SCOPE_VIOLATION'
            )
        )
      );
    }

    // ==========================================
    // TEST 27: Allowlist cannot bypass STANDARD canonical protection
    // ==========================================
    {
      const initialHash = 'C'.repeat(64);

      const result = validateBaselineManifest({
        gateId: 'TEST_ALLOWLIST_CANNOT_BYPASS_CANON',
        gateType: 'STANDARD',
        allowedPaths: ['AGENTS.md'],
        worktreeBaseline: [{
          path: 'AGENTS.md',
          status: ' M',
          contentSha256: initialHash,
          mutationPolicy: 'mutable',
        }],
      }, {
        skipDiffCheck: true,
        mockChangedEntries: [{
          path: 'AGENTS.md',
          status: ' M',
          contentSha256: initialHash,
        }],
      });

      record(
        'TEST_27',
        'Allowlist Cannot Bypass Canonical Protection',
        !result.passed &&
        result.errors.some(
          (error) =>
            error.includes(
              'STANDARD_GATE_CANNOT_ALLOW_CANONICAL_PATH'
            ) ||
            error.includes(
              'GATE_MUTATION_SCOPE_VIOLATION'
            )
        )
      );
    }

    // ==========================================
    // TEST 28: Canonical record updates are isolated from contracts
    // ==========================================
    {
      const auth = {
        authority: 'CHAT_MASTER',
        decisionRef: 'TEST-DECISION-28',
      };

      const good = validateBaselineManifest({
        gateId: 'TEST_RECORD_UPDATE_ALLOWED',
        gateType: 'CANONICAL_RECORD_UPDATE',
        masterAuthorization: auth,
        allowedPaths: ['docs/STATUS.md'],
      }, {
        skipDiffCheck: true,
        mockChangedEntries: [],
      });

      const badContract = validateBaselineManifest({
        gateId: 'TEST_RECORD_UPDATE_CONTRACT_REJECTED',
        gateType: 'CANONICAL_RECORD_UPDATE',
        masterAuthorization: auth,
        allowedPaths: ['docs/FSD.md'],
      }, {
        skipDiffCheck: true,
        mockChangedEntries: [],
      });

      const badReverse = validateBaselineManifest({
        gateId: 'TEST_CONTRACT_UPDATE_RECORD_REJECTED',
        gateType: 'CANONICAL_AMENDMENT',
        masterAuthorization: auth,
        allowedPaths: ['docs/STATUS.md'],
      }, {
        skipDiffCheck: true,
        mockChangedEntries: [],
      });

      record(
        'TEST_28',
        'Canonical Record and Contract Gate Isolation',
        good.passed &&
        !badContract.passed &&
        !badReverse.passed
      );
    }

    // ==========================================
    // TEST 29: Safety core requires isolated safety amendment
    // ==========================================
    {
      const auth = {
        authority: 'CHAT_MASTER',
        decisionRef: 'TEST-DECISION-29',
      };

      const standardRejected =
        validateBaselineManifest({
          gateId: 'TEST_STANDARD_SAFETY_REJECTION',
          gateType: 'STANDARD',
          allowedPaths: [
            'scripts/safety/check-baseline.mjs',
          ],
        }, {
          skipDiffCheck: true,
          mockChangedEntries: [],
        });

      const safetyAllowed =
        validateBaselineManifest({
          gateId: 'TEST_SAFETY_AMENDMENT_ALLOWED',
          gateType: 'SAFETY_AMENDMENT',
          masterAuthorization: auth,
          allowedPaths: [
            'scripts/safety/check-baseline.mjs',
          ],
        }, {
          skipDiffCheck: true,
          mockChangedEntries: [],
        });

      const safetyCanonicalRejected =
        validateBaselineManifest({
          gateId: 'TEST_SAFETY_CANONICAL_REJECTION',
          gateType: 'SAFETY_AMENDMENT',
          masterAuthorization: auth,
          allowedPaths: ['AGENTS.md'],
        }, {
          skipDiffCheck: true,
          mockChangedEntries: [],
        });

      record(
        'TEST_29',
        'Safety Core Amendment Isolation',
        !standardRejected.passed &&
        safetyAllowed.passed &&
        !safetyCanonicalRejected.passed
      );
    }

  } finally {
    // Cleanup temporary test directories
    for (const d of tempDirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  const allPassed = testResults.every((t) => t.passed);
  console.log(`\n=== SAFETY BARRIER SELF-TEST SUMMARY ===`);
  console.log(`TOTAL TESTS: ${testResults.length}`);
  console.log(`PASSED: ${testResults.filter((t) => t.passed).length}`);
  console.log(`FAILED: ${testResults.filter((t) => !t.passed).length}`);
  console.log(`ALL_PASSED: ${allPassed ? 'SIM' : 'NAO'}`);

  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error(`FATAL ERROR running safety barrier self-tests: ${err.message}`);
  process.exit(1);
});
