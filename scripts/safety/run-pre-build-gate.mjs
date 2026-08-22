#!/usr/bin/env node

/**
 * Xandeflix 2.0 - Mechanical Safety Barrier
 * Pre-Build Gate Runner & Step Orchestrator
 *
 * Enforces baseline verification, deterministic child command execution with
 * strict array arguments (no shell string execution), hard stop on failure,
 * writer lock coordination, and machine-readable gate reporting.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBaselineManifest, normalizePath } from './check-baseline.mjs';
import { acquireWriterLock, releaseWriterLock } from './writer-lock.mjs';

export function runPreBuildGate({ manifestPath, writer = 'ANTIGRAVITY_LOCAL', skipLock = false, customReportPath = null, phase = 'pre' }) {
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at: ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const gateId = manifest.gateId || 'UNKNOWN_GATE';
  const reportPath = customReportPath || manifest.reportPath || null;

  const report = {
    gate: gateId,
    result: 'RUNNING',
    executor: writer,
    timestamp: new Date().toISOString(),
    phase,
    canonicalChecks: null,
    allowlistCheck: null,
    dependencyCheck: null,
    writerLock: null,
    steps: [],
    failedStep: null,
    nextStepExecutedAfterFailure: false,
    forbiddenOperationCounters: {
      sourceEdits: 0,
      docsEdits: 0,
      androidEdits: 0,
      gitAdds: 0,
      commits: 0,
      pushes: 0,
      prs: 0,
    },
    safeToCommit: false,
    safeToPush: false,
  };

  let lockAcquired = false;

  try {
    // 1. Writer Lock Acquisition
    if (!skipLock) {
      const lockRes = acquireWriterLock({ gateId, writer });
      report.writerLock = lockRes;
      if (!lockRes.success) {
        report.result = 'FAIL_WRITER_LOCK';
        report.failedStep = 'ACQUIRE_WRITER_LOCK';
        writeReportIfPath(report, reportPath);
        return report;
      }
      lockAcquired = true;
    }

    // 2. Baseline Check
    const baselineRes = validateBaselineManifest(manifest, { phase });
    report.canonicalChecks = {
      passed: baselineRes.passed,
      errors: baselineRes.errors,
      gitInfo: baselineRes.details.gitInfo,
      dirtyBaselineCoverage: baselineRes.details.worktreeBaseline?.coveragePassed ?? false,
    };
    report.allowlistCheck = {
      passed: !baselineRes.details.pathViolations || baselineRes.details.pathViolations.length === 0,
      violations: baselineRes.details.pathViolations || [],
    };
    report.dependencyCheck = {
      passed: !baselineRes.details.dependencyMismatches || baselineRes.details.dependencyMismatches.length === 0,
      mismatches: baselineRes.details.dependencyMismatches || [],
    };

    if (!baselineRes.passed) {
      report.result = 'FAIL_BASELINE';
      report.failedStep = 'CHECK_BASELINE';
      writeReportIfPath(report, reportPath);
      return report;
    }

    // 3. Targeted Commands with Hard Stop
    const targetedCommands = manifest.targetedCommands || [];
    let hadFailure = false;

    for (let i = 0; i < targetedCommands.length; i++) {
      const step = targetedCommands[i];
      const stepName = step.name || `Step_${i + 1}_${step.command}`;
      const cwd = step.cwd ? resolve(process.cwd(), step.cwd) : process.cwd();

      if (hadFailure) {
        report.nextStepExecutedAfterFailure = true;
        break;
      }

      const stepRecord = {
        name: stepName,
        command: step.command,
        args: step.args || [],
        cwd,
        exitCode: null,
        passed: false,
        durationMs: 0,
        error: null,
      };

      const start = Date.now();
      try {
        const res = spawnSync(step.command, step.args || [], {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
          shell: false, // Strict array execution, no shell injection
        });

        stepRecord.durationMs = Date.now() - start;
        stepRecord.exitCode = res.status;
        stepRecord.passed = res.status === 0;

        if (res.status !== 0) {
          hadFailure = true;
          stepRecord.error = (res.stderr || res.stdout || 'Command failed with non-zero exit code').trim();
          report.failedStep = stepName;
          report.result = 'FAIL_STEP';
        }
      } catch (err) {
        stepRecord.durationMs = Date.now() - start;
        stepRecord.passed = false;
        stepRecord.error = err.message;
        hadFailure = true;
        report.failedStep = stepName;
        report.result = 'FAIL_STEP';
      }

      report.steps.push(stepRecord);

      if (hadFailure) {
        // HARD STOP - immediately abort remaining steps
        break;
      }
    }

    if (!hadFailure) {
      report.result = 'PASS_PRE_BUILD';
    }

    writeReportIfPath(report, reportPath);
    return report;
  } finally {
    // 4. Writer Lock Release (Normal cleanup)
    if (lockAcquired) {
      releaseWriterLock({ gateId, writer });
    }
  }
}

function writeReportIfPath(report, reportPath) {
  if (!reportPath) return;
  try {
    const fullPath = resolve(reportPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    console.error(`Warning: Failed to write report to ${reportPath}: ${err.message}`);
  }
}

// CLI Execution
if (process.argv[1] && normalizePath(process.argv[1]) === normalizePath(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let manifestPath = null;
  let writer = 'ANTIGRAVITY_LOCAL';
  let skipLock = false;
  let customReportPath = null;
  let phase = 'pre';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && i + 1 < args.length) manifestPath = args[++i];
    else if (args[i] === '--writer' && i + 1 < args.length) writer = args[++i];
    else if (args[i] === '--report' && i + 1 < args.length) customReportPath = args[++i];
    else if (args[i] === '--phase' && i + 1 < args.length) phase = args[++i];
    else if (args[i] === '--skip-lock') skipLock = true;
  }

  if (!manifestPath) {
    console.error('ERROR: --manifest <path> is required');
    process.exit(1);
  }

  try {
    const report = runPreBuildGate({ manifestPath, writer, skipLock, customReportPath, phase });
    if (report.result !== 'PASS_PRE_BUILD') {
      console.error(`\n=== PRE-BUILD GATE FAILED (Gate: ${report.gate}) ===`);
      console.error(`Result: ${report.result}`);
      console.error(`Failed Step: ${report.failedStep || 'Unknown'}`);
      process.exit(1);
    }

    console.log(`=== PRE-BUILD GATE PASSED (Gate: ${report.gate}) ===`);
    console.log(`Steps executed: ${report.steps.length}`);
    process.exit(0);
  } catch (err) {
    console.error(`FATAL ERROR in pre-build gate runner: ${err.message}`);
    process.exit(1);
  }
}
