#!/usr/bin/env node

/**
 * Xandeflix 2.0 - Mechanical Safety Barrier
 * Physical Evidence & Device-Logcat Provenance Auditor
 *
 * Verifies host-captured device logcat artifacts against strict provenance requirements:
 * timestamps, required cycle markers, PID presence, ordered transitions, and CONFIG_FLAGS.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeSha256, normalizePath, validateManifestStructure } from './check-baseline.mjs';

// Standard Android logcat timestamp regex (e.g. "08-19 09:13:08.159")
const LOGCAT_LINE_REGEX = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s*(.*)$/;

export function parseLogcatLine(line) {
  const match = line.match(LOGCAT_LINE_REGEX);
  if (!match) return null;
  return {
    timestampStr: match[1],
    pid: match[2],
    tid: match[3],
    level: match[4],
    tag: match[5].trim(),
    message: match[6],
  };
}

export function parseTimestampToMillis(tsStr) {
  // Format: "MM-DD HH:mm:ss.SSS" - assume current reference year
  const parts = tsStr.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!parts) return null;
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const hour = parseInt(parts[3], 10);
  const min = parseInt(parts[4], 10);
  const sec = parseInt(parts[5], 10);
  const ms = parseInt(parts[6], 10);

  const d = new Date(2026, month, day, hour, min, sec, ms);
  return d.getTime();
}

export function auditPhysicalEvidence({
  logPath,
  expectedSha256 = null,
  requiredMarkers = [],
  requiredPids = [],
  minimumTimestamp = null,
  maximumTimestamp = null,
  expectedSize = null,
  requiredRuntimeFlags = null,
  orderedMarkerSequences = [],
}) {
  const report = {
    passed: true,
    errors: [],
    details: {
      logPath,
      sizeBytes: 0,
      sha256: null,
      firstTimestamp: null,
      lastTimestamp: null,
      foundMarkers: {},
      foundPids: {},
      runtimeFlags: null,
    },
  };

  if (!existsSync(logPath)) {
    report.passed = false;
    report.errors.push(`Evidence log file not found at: ${logPath}`);
    return report;
  }

  const stat = statSync(logPath);
  report.details.sizeBytes = stat.size;

  if (stat.size === 0) {
    report.passed = false;
    report.errors.push(`Evidence log file is empty (0 bytes): ${logPath}`);
    return report;
  }

  if (expectedSize !== null && stat.size !== expectedSize) {
    report.passed = false;
    report.errors.push(`Evidence log size mismatch. Expected: ${expectedSize}, Actual: ${stat.size}`);
  }

  const actualSha = computeSha256(logPath);
  report.details.sha256 = actualSha;

  if (expectedSha256 && actualSha.toUpperCase() !== expectedSha256.toUpperCase()) {
    report.passed = false;
    report.errors.push(`Evidence log SHA256 mismatch. Expected: ${expectedSha256}, Actual: ${actualSha}`);
  }

  const rawContent = readFileSync(logPath, 'utf8');
  const lines = rawContent.split(/\r?\n/);

  let firstTs = null;
  let lastTs = null;
  const markerPositions = {};
  const seenPids = new Set();
  let foundConfigFlags = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parsed = parseLogcatLine(line);
    if (parsed) {
      const ms = parseTimestampToMillis(parsed.timestampStr);
      if (ms !== null) {
        if (firstTs === null) firstTs = { str: parsed.timestampStr, ms };
        lastTs = { str: parsed.timestampStr, ms };
      }
      seenPids.add(parsed.pid);
    }

    // Marker check
    for (const marker of requiredMarkers) {
      if (line.includes(marker)) {
        if (!markerPositions[marker]) {
          markerPositions[marker] = [];
        }
        markerPositions[marker].push(i);
      }
    }

    // Config flags check
    if (line.includes('event=CONFIG_FLAGS') || (line.includes('CONFIG_FLAGS') && line.includes('snapshotImportEnabled'))) {
      const importMatch = line.match(/snapshotImportEnabled=(true|false)/);
      const promoMatch = line.match(/snapshotPromotionEnabled=(true|false)/);
      if (importMatch && promoMatch) {
        foundConfigFlags = {
          snapshotImportEnabled: importMatch[1] === 'true',
          snapshotPromotionEnabled: promoMatch[1] === 'true',
          lineIndex: i,
        };
      }
    }
  }

  report.details.firstTimestamp = firstTs ? firstTs.str : null;
  report.details.lastTimestamp = lastTs ? lastTs.str : null;
  report.details.foundMarkers = markerPositions;
  report.details.runtimeFlags = foundConfigFlags;

  // Timestamp monotonicity check
  if (firstTs && lastTs && lastTs.ms < firstTs.ms) {
    report.passed = false;
    report.errors.push(`Timestamp inconsistency: last timestamp (${lastTs.str}) precedes first timestamp (${firstTs.str})`);
  }

  // Minimum / maximum timestamp boundaries
  if (minimumTimestamp) {
    const minMs = parseTimestampToMillis(minimumTimestamp);
    if (minMs === null) {
      report.passed = false;
      report.errors.push(`Invalid minimum timestamp boundary: ${minimumTimestamp}`);
    } else if (!firstTs || !lastTs) {
      report.passed = false;
      report.errors.push('Evidence contains no parseable timestamps for minimum boundary validation');
    } else if (firstTs.ms < minMs) {
      report.passed = false;
      report.errors.push(`Evidence starts before minimum timestamp boundary (${minimumTimestamp}): got ${firstTs.str}`);
    }
  }

  if (maximumTimestamp) {
    const maxMs = parseTimestampToMillis(maximumTimestamp);
    if (maxMs === null) {
      report.passed = false;
      report.errors.push(`Invalid maximum timestamp boundary: ${maximumTimestamp}`);
    } else if (!firstTs || !lastTs) {
      report.passed = false;
      report.errors.push('Evidence contains no parseable timestamps for maximum boundary validation');
    } else if (lastTs.ms > maxMs) {
      report.passed = false;
      report.errors.push(`Evidence ends after maximum timestamp boundary (${maximumTimestamp}): got ${lastTs.str}`);
    }
  }

  // Required markers validation
  for (const marker of requiredMarkers) {
    if (!markerPositions[marker] || markerPositions[marker].length === 0) {
      report.passed = false;
      report.errors.push(`Required marker missing from evidence: '${marker}'`);
    }
  }

  // Only explicitly declared sequences impose temporal ordering.
  report.details.orderedMarkerSequences = [];
  for (const sequence of orderedMarkerSequences) {
    let lastPos = -1;
    const resolved = [];
    for (const marker of sequence) {
      const nextPos = (markerPositions[marker] || []).find((position) => position > lastPos);
      if (nextPos === undefined) {
        report.passed = false;
        report.errors.push(`Marker ordering violation: sequence cannot place '${marker}' after line ${lastPos}`);
        break;
      }
      resolved.push({ marker, line: nextPos });
      lastPos = nextPos;
    }
    report.details.orderedMarkerSequences.push(resolved);
  }

  // Required PIDs validation
  for (const pid of requiredPids) {
    const pidStr = pid.toString();
    report.details.foundPids[pidStr] = seenPids.has(pidStr);
    if (!seenPids.has(pidStr)) {
      report.passed = false;
      report.errors.push(`Required PID missing from logcat entries: ${pidStr}`);
    }
  }

  // Runtime flags validation
  if (requiredRuntimeFlags) {
    if (!foundConfigFlags) {
      report.passed = false;
      report.errors.push('Required runtime CONFIG_FLAGS event missing from log');
    } else {
      if (requiredRuntimeFlags.snapshotImportEnabled !== undefined && foundConfigFlags.snapshotImportEnabled !== requiredRuntimeFlags.snapshotImportEnabled) {
        report.passed = false;
        report.errors.push(`Runtime snapshotImportEnabled mismatch: expected=${requiredRuntimeFlags.snapshotImportEnabled}, actual=${foundConfigFlags.snapshotImportEnabled}`);
      }
      if (requiredRuntimeFlags.snapshotPromotionEnabled !== undefined && foundConfigFlags.snapshotPromotionEnabled !== requiredRuntimeFlags.snapshotPromotionEnabled) {
        report.passed = false;
        report.errors.push(`Runtime snapshotPromotionEnabled mismatch: expected=${requiredRuntimeFlags.snapshotPromotionEnabled}, actual=${foundConfigFlags.snapshotPromotionEnabled}`);
      }
    }
  }

  return report;
}

// CLI Execution
if (process.argv[1] && normalizePath(process.argv[1]) === normalizePath(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let logPath = null;
  let manifestPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--log' && i + 1 < args.length) logPath = args[++i];
    else if (args[i] === '--manifest' && i + 1 < args.length) manifestPath = args[++i];
  }

  let config = { logPath };

  if (manifestPath && existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const structure = validateManifestStructure(manifest);
    if (!structure.valid) {
      console.error('ERROR: Invalid manifest structure');
      for (const error of structure.errors) console.error(`[-] ${error}`);
      process.exit(1);
    }
    if (manifest.physicalEvidenceRequirements) {
      config = {
        logPath: logPath || manifest.physicalEvidenceRequirements.logPath,
        expectedSha256: manifest.physicalEvidenceRequirements.expectedSha256,
        requiredMarkers: manifest.physicalEvidenceRequirements.requiredMarkers || [],
        requiredPids: manifest.physicalEvidenceRequirements.requiredPids || [],
        minimumTimestamp: manifest.physicalEvidenceRequirements.minimumTimestamp,
        maximumTimestamp: manifest.physicalEvidenceRequirements.maximumTimestamp,
        expectedSize: manifest.physicalEvidenceRequirements.expectedSize,
        requiredRuntimeFlags: manifest.physicalEvidenceRequirements.requiredRuntimeFlags,
        orderedMarkerSequences: manifest.physicalEvidenceRequirements.orderedMarkerSequences || [],
      };
    }
  }

  if (!config.logPath) {
    console.error('ERROR: --log <path> or --manifest <path> with physicalEvidenceRequirements is required');
    process.exit(1);
  }

  const result = auditPhysicalEvidence(config);

  if (!result.passed) {
    console.error('\n=== PHYSICAL EVIDENCE PROVENANCE AUDIT FAILED ===');
    for (const err of result.errors) {
      console.error(`[-] ${err}`);
    }
    process.exit(1);
  }

  console.log('=== PHYSICAL EVIDENCE PROVENANCE AUDIT PASSED ===');
  console.log(`Log Path: ${result.details.logPath}`);
  console.log(`Size: ${result.details.sizeBytes} bytes`);
  console.log(`SHA256: ${result.details.sha256}`);
  console.log(`Time Range: ${result.details.firstTimestamp} -> ${result.details.lastTimestamp}`);
  process.exit(0);
}
