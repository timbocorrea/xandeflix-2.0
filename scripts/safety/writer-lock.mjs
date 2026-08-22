#!/usr/bin/env node

/**
 * Xandeflix 2.0 - Mechanical Safety Barrier
 * Local Single-Writer Lock Manager
 *
 * Prevents concurrent agent execution and unauthorized file writes.
 * Atomic file creation via O_EXCL. Stale locks are NEVER deleted automatically.
 */

import { existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath, getGitInfo, isSubPath } from './check-baseline.mjs';

export function getDefaultLockPath(worktree = null) {
  const root = worktree || getGitInfo().toplevel;
  const rootKey = createHash('sha256')
    .update(normalizePath(root).toLowerCase(), 'utf8')
    .digest('hex');
  return resolve(tmpdir(), 'xandeflix-safety-locks', `${rootKey}.lock`);
}

function resolveLockPath(worktree, lockPath) {
  const root = worktree || getGitInfo().toplevel;
  const finalLockPath = lockPath || getDefaultLockPath(worktree);
  if (isSubPath(root, finalLockPath)) {
    throw new Error(`Writer lock must be outside the canonical worktree: ${finalLockPath}`);
  }
  return { root, finalLockPath };
}

export function isPidRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // Running but no permission to signal
  }
}

export function acquireWriterLock({ gateId, writer, worktree = null, lockPath = null }) {
  const { root, finalLockPath } = resolveLockPath(worktree, lockPath);
  const normWorktree = normalizePath(root);

  const payload = {
    gateId,
    writer,
    worktree: normWorktree,
    timestamp: new Date().toISOString(),
    pid: process.pid,
  };

  try {
    mkdirSync(dirname(finalLockPath), { recursive: true });
    const fd = openSync(finalLockPath, 'wx');
    writeFileSync(fd, JSON.stringify(payload, null, 2), 'utf8');
    closeSync(fd);
    return {
      success: true,
      lockPath: finalLockPath,
      payload,
    };
  } catch (err) {
    if (err.code === 'EEXIST') {
      let existing = null;
      try {
        existing = JSON.parse(readFileSync(finalLockPath, 'utf8'));
      } catch (parseErr) {
        existing = { raw: 'corrupted' };
      }

      const pidActive = existing && existing.pid ? isPidRunning(existing.pid) : false;

      return {
        success: false,
        conflict: true,
        staleSuspected: !pidActive,
        existingPayload: existing,
        lockPath: finalLockPath,
        error: `Writer lock already held by ${existing?.writer || 'unknown'} for gate ${existing?.gateId || 'unknown'} (PID: ${existing?.pid || 'unknown'})`,
      };
    }
    throw err;
  }
}

export function releaseWriterLock({ gateId, writer, worktree = null, lockPath = null }) {
  const { root, finalLockPath } = resolveLockPath(worktree, lockPath);
  const normWorktree = normalizePath(root);

  if (!existsSync(finalLockPath)) {
    return {
      success: false,
      error: `Lock file does not exist at: ${finalLockPath}`,
    };
  }

  let existing = null;
  try {
    existing = JSON.parse(readFileSync(finalLockPath, 'utf8'));
  } catch (err) {
    return {
      success: false,
      error: `Corrupted lock file at ${finalLockPath}. Manual removal required.`,
    };
  }

  // Strict ownership check
  if (
    existing.gateId !== gateId ||
    existing.writer !== writer ||
    normalizePath(existing.worktree).toLowerCase() !== normWorktree.toLowerCase()
  ) {
    return {
      success: false,
      error: `Permission denied: caller (${writer}, gate: ${gateId}) does not match lock owner (${existing.writer}, gate: ${existing.gateId})`,
      existingPayload: existing,
    };
  }

  try {
    unlinkSync(finalLockPath);
    return {
      success: true,
      releasedPayload: existing,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to remove lock file: ${err.message}`,
    };
  }
}

export function getWriterLockStatus(lockPath = null, worktree = null) {
  const { finalLockPath } = resolveLockPath(worktree, lockPath);
  if (!existsSync(finalLockPath)) {
    return { locked: false, lockPath: finalLockPath };
  }

  try {
    const existing = JSON.parse(readFileSync(finalLockPath, 'utf8'));
    const pidActive = existing.pid ? isPidRunning(existing.pid) : false;
    return {
      locked: true,
      staleSuspected: !pidActive,
      payload: existing,
      lockPath: finalLockPath,
    };
  } catch (err) {
    return {
      locked: true,
      corrupted: true,
      error: err.message,
      lockPath: finalLockPath,
    };
  }
}

// CLI Execution
if (process.argv[1] && normalizePath(process.argv[1]) === normalizePath(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const action = args[0];

  let gateId = null;
  let writer = null;
  let worktree = null;
  let lockPath = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--gate' && i + 1 < args.length) gateId = args[++i];
    else if (args[i] === '--writer' && i + 1 < args.length) writer = args[++i];
    else if (args[i] === '--worktree' && i + 1 < args.length) worktree = args[++i];
    else if (args[i] === '--lockfile' && i + 1 < args.length) lockPath = args[++i];
  }

  if (action === 'acquire') {
    if (!gateId || !writer) {
      console.error('ERROR: --gate <id> and --writer <name> are required for acquire');
      process.exit(1);
    }
    const res = acquireWriterLock({ gateId, writer, worktree, lockPath });
    if (!res.success) {
      console.error(`WRITER_LOCK_CONFLICT=SIM`);
      if (res.staleSuspected) console.error(`STALE_LOCK_SUSPECTED=SIM`);
      console.error(`[-] ${res.error}`);
      process.exit(1);
    }
    console.log(`WRITER_LOCK_ACQUIRED=SIM`);
    console.log(`Lock path: ${res.lockPath}`);
    process.exit(0);
  } else if (action === 'release') {
    if (!gateId || !writer) {
      console.error('ERROR: --gate <id> and --writer <name> are required for release');
      process.exit(1);
    }
    const res = releaseWriterLock({ gateId, writer, worktree, lockPath });
    if (!res.success) {
      console.error(`[-] ${res.error}`);
      process.exit(1);
    }
    console.log(`WRITER_LOCK_RELEASED=SIM`);
    process.exit(0);
  } else if (action === 'status') {
    const res = getWriterLockStatus(lockPath, worktree);
    if (res.locked) {
      console.log(`LOCKED: Held by ${res.payload?.writer || 'unknown'} (Gate: ${res.payload?.gateId || 'unknown'}, PID: ${res.payload?.pid || 'unknown'})`);
      if (res.staleSuspected) console.log(`STALE_LOCK_SUSPECTED=SIM`);
    } else {
      console.log('UNLOCKED: No active writer lock');
    }
    process.exit(0);
  } else {
    console.error('Usage: writer-lock.mjs <acquire|release|status> --gate <id> --writer <name> [--worktree <path>] [--lockfile <path>]');
    process.exit(1);
  }
}
