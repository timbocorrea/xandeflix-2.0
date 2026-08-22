#!/usr/bin/env node

/**
 * Xandeflix 2.0 - Mechanical Safety Barrier
 * Baseline and Canonical Integrity Checker
 *
 * Validates canonical root, branch, HEAD, diff formatting, allowlist,
 * protected paths, architecture document hashes, critical source hashes,
 * and semantic dependency integrity against a gate baseline manifest.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE_TYPES = Object.freeze({
  STANDARD: 'STANDARD',
  CANONICAL_AMENDMENT: 'CANONICAL_AMENDMENT',
  CANONICAL_RECORD_UPDATE: 'CANONICAL_RECORD_UPDATE',
  SAFETY_AMENDMENT: 'SAFETY_AMENDMENT',
});

export const CANONICAL_TIER_0_PATHS = Object.freeze([
  'AGENTS.md',
  'docs/architecture/**',
  'docs/governance/**',
]);

export const CANONICAL_TIER_1_PATHS = Object.freeze([
  'docs/FSD.md',
  'docs/DESIGN.md',
  'docs/MVP_ACCEPTANCE.md',
  'docs/product/**',
]);

export const CANONICAL_TIER_2_PATHS = Object.freeze([
  'docs/PLANO.md',
  'docs/STATUS.md',
  'docs/ERROS.md',
]);

export const SAFETY_CORE_PATHS = Object.freeze([
  'scripts/safety/**',
]);

export function getEffectiveGateType(manifest = {}) {
  return manifest.gateType || GATE_TYPES.STANDARD;
}

function pathRuleBase(rule) {
  let value = normalizePath(rule).toLowerCase();

  if (value.endsWith('/**')) {
    value = value.slice(0, -3);
  } else if (value.endsWith('/*')) {
    value = value.slice(0, -2);
  }

  return value;
}

function ruleIsWithinRule(candidate, container) {
  const candidateBase = pathRuleBase(candidate);
  const containerBase = pathRuleBase(container);

  return (
    candidateBase === containerBase ||
    candidateBase.startsWith(containerBase + '/')
  );
}

function ruleOverlapsRule(a, b) {
  return (
    ruleIsWithinRule(a, b) ||
    ruleIsWithinRule(b, a)
  );
}

function ruleIsWithinAny(candidate, containers) {
  return containers.some(
    (container) => ruleIsWithinRule(candidate, container)
  );
}

function ruleOverlapsAny(candidate, rules) {
  return rules.some(
    (rule) => ruleOverlapsRule(candidate, rule)
  );
}

export function classifyIntrinsicPath(filePath) {
  if (
    CANONICAL_TIER_0_PATHS.some(
      (rule) => matchPathRule(filePath, rule)
    )
  ) {
    return 'CANONICAL_TIER_0';
  }

  if (
    CANONICAL_TIER_1_PATHS.some(
      (rule) => matchPathRule(filePath, rule)
    )
  ) {
    return 'CANONICAL_TIER_1';
  }

  if (
    CANONICAL_TIER_2_PATHS.some(
      (rule) => matchPathRule(filePath, rule)
    )
  ) {
    return 'CANONICAL_TIER_2';
  }

  if (
    SAFETY_CORE_PATHS.some(
      (rule) => matchPathRule(filePath, rule)
    )
  ) {
    return 'SAFETY_CORE';
  }

  return null;
}

function isMutationAllowedForGate(
  gateType,
  classification
) {
  if (gateType === GATE_TYPES.STANDARD) {
    return classification === null;
  }

  if (
    gateType === GATE_TYPES.CANONICAL_AMENDMENT
  ) {
    return (
      classification === 'CANONICAL_TIER_0' ||
      classification === 'CANONICAL_TIER_1'
    );
  }

  if (
    gateType === GATE_TYPES.CANONICAL_RECORD_UPDATE
  ) {
    return classification === 'CANONICAL_TIER_2';
  }

  if (
    gateType === GATE_TYPES.SAFETY_AMENDMENT
  ) {
    return classification === 'SAFETY_CORE';
  }

  return false;
}

export function validateIntrinsicGatePolicy(manifest) {
  const gateType = getEffectiveGateType(manifest);
  const allowedPaths = manifest.allowedPaths || [];
  const baseline = manifest.worktreeBaseline || [];
  const errors = [];

  const constitutionalPaths = [
    ...CANONICAL_TIER_0_PATHS,
    ...CANONICAL_TIER_1_PATHS,
  ];

  const allCanonicalPaths = [
    ...constitutionalPaths,
    ...CANONICAL_TIER_2_PATHS,
  ];

  if (
    gateType !== GATE_TYPES.STANDARD &&
    allowedPaths.length === 0
  ) {
    errors.push(
      'SPECIAL_GATE_REQUIRES_EXPLICIT_ALLOWED_PATHS'
    );
  }

  for (const allow of allowedPaths) {
    if (gateType === GATE_TYPES.STANDARD) {
      if (ruleOverlapsAny(allow, allCanonicalPaths)) {
        errors.push(
          "STANDARD_GATE_CANNOT_ALLOW_CANONICAL_PATH: '" +
          allow +
          "'"
        );
      }

      if (ruleOverlapsAny(allow, SAFETY_CORE_PATHS)) {
        errors.push(
          "STANDARD_GATE_CANNOT_ALLOW_SAFETY_CORE: '" +
          allow +
          "'"
        );
      }

      continue;
    }

    if (
      gateType === GATE_TYPES.CANONICAL_AMENDMENT &&
      !ruleIsWithinAny(allow, constitutionalPaths)
    ) {
      errors.push(
        "CANONICAL_AMENDMENT_SCOPE_VIOLATION: '" +
        allow +
        "'"
      );
    }

    if (
      gateType ===
        GATE_TYPES.CANONICAL_RECORD_UPDATE &&
      !ruleIsWithinAny(
        allow,
        CANONICAL_TIER_2_PATHS
      )
    ) {
      errors.push(
        "CANONICAL_RECORD_UPDATE_SCOPE_VIOLATION: '" +
        allow +
        "'"
      );
    }

    if (
      gateType === GATE_TYPES.SAFETY_AMENDMENT &&
      !ruleIsWithinAny(allow, SAFETY_CORE_PATHS)
    ) {
      errors.push(
        "SAFETY_AMENDMENT_SCOPE_VIOLATION: '" +
        allow +
        "'"
      );
    }
  }

  for (const entry of baseline) {
    if (entry.mutationPolicy !== 'mutable') {
      continue;
    }

    const classification =
      classifyIntrinsicPath(entry.path);

    if (
      !isMutationAllowedForGate(
        gateType,
        classification
      )
    ) {
      errors.push(
        "GATE_MUTATION_SCOPE_VIOLATION: '" +
        entry.path +
        "' cannot be mutable in gateType " +
        gateType
      );
    }
  }

  return {
    passed: errors.length === 0,
    gateType,
    errors,
  };
}

export function normalizePath(p) {
  if (!p) return '';
  let norm = normalize(p).replace(/\\/g, '/');
  if (norm.endsWith('/') && norm.length > 1) {
    norm = norm.slice(0, -1);
  }
  return norm;
}

export function isSubPath(parent, child) {
  const normParent = normalizePath(parent).toLowerCase();
  const normChild = normalizePath(child).toLowerCase();
  return normChild === normParent || normChild.startsWith(`${normParent}/`);
}

export function computeSha256(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found for hash computation: ${filePath}`);
  }
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex').toUpperCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSha256(value) {
  return typeof value === 'string' && /^[A-Fa-f0-9]{64}$/.test(value);
}

function addTypeError(errors, path, expected, actual) {
  errors.push(`${path} must be ${expected}; got ${actual}`);
}

function validateStringArray(value, path, errors) {
  if (!Array.isArray(value)) {
    addTypeError(errors, path, 'an array of strings', typeof value);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string') addTypeError(errors, `${path}[${index}]`, 'a string', typeof item);
  });
}

function validateHashMap(value, path, errors) {
  if (!isPlainObject(value)) {
    addTypeError(errors, path, 'an object of SHA-256 strings', typeof value);
    return;
  }
  for (const [key, hash] of Object.entries(value)) {
    if (!isSha256(hash)) errors.push(`${path}.${key} must be a 64-character SHA-256 hex string`);
  }
}

function validateAllowedKeys(value, path, allowedKeys, errors) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) errors.push(`${path}.${key} is not a supported field`);
  }
}

export function validateManifestStructure(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) {
    return { valid: false, errors: ['Manifest must be a JSON object'] };
  }

  const topLevelKeys = [
    'gateId', 'gateType', 'masterAuthorization',
    'canonicalRoot', 'expectedBranch', 'expectedHead', 'allowedPaths',
    'protectedPaths', 'architectureHashes', 'criticalFileHashes', 'worktreeBaseline',
    'expectedBuildFlags', 'dependencyBaseline', 'targetedCommands',
    'physicalEvidenceRequirements', 'artifactRequirements', 'reportPath',
  ];
  validateAllowedKeys(manifest, 'manifest', topLevelKeys, errors);

  if (typeof manifest.gateId !== 'string' || manifest.gateId.trim() === '') {
    addTypeError(errors, 'gateId', 'a non-empty string', typeof manifest.gateId);
  }

  if (
    manifest.gateType !== undefined &&
    !Object.values(GATE_TYPES).includes(manifest.gateType)
  ) {
    errors.push(
      'gateType must be one of: ' +
      Object.values(GATE_TYPES).join(', ')
    );
  }

  if (manifest.masterAuthorization !== undefined) {
    if (!isPlainObject(manifest.masterAuthorization)) {
      addTypeError(
        errors,
        'masterAuthorization',
        'an object',
        typeof manifest.masterAuthorization
      );
    } else {
      validateAllowedKeys(
        manifest.masterAuthorization,
        'masterAuthorization',
        ['authority', 'decisionRef'],
        errors
      );

      if (
        manifest.masterAuthorization.authority !==
        'CHAT_MASTER'
      ) {
        errors.push(
          'masterAuthorization.authority must equal CHAT_MASTER'
        );
      }

      if (
        typeof manifest.masterAuthorization.decisionRef !==
          'string' ||
        manifest.masterAuthorization.decisionRef.trim() === ''
      ) {
        errors.push(
          'masterAuthorization.decisionRef must be a non-empty string'
        );
      }
    }
  }

  const effectiveGateType =
    getEffectiveGateType(manifest);

  if (
    effectiveGateType !== GATE_TYPES.STANDARD &&
    !isPlainObject(manifest.masterAuthorization)
  ) {
    errors.push(
      'masterAuthorization is required for gateType ' +
      effectiveGateType
    );
  }

  for (const key of ['canonicalRoot', 'expectedBranch', 'expectedHead', 'reportPath']) {
    if (manifest[key] !== undefined && typeof manifest[key] !== 'string') {
      addTypeError(errors, key, 'a string', typeof manifest[key]);
    }
  }

  for (const key of ['allowedPaths', 'protectedPaths']) {
    if (manifest[key] !== undefined) validateStringArray(manifest[key], key, errors);
  }
  for (const key of ['architectureHashes', 'criticalFileHashes']) {
    if (manifest[key] !== undefined) validateHashMap(manifest[key], key, errors);
  }

  if (manifest.worktreeBaseline !== undefined) {
    if (!Array.isArray(manifest.worktreeBaseline)) {
      addTypeError(errors, 'worktreeBaseline', 'an array', typeof manifest.worktreeBaseline);
    } else {
      const paths = new Set();
      manifest.worktreeBaseline.forEach((entry, index) => {
        const path = `worktreeBaseline[${index}]`;
        if (!isPlainObject(entry)) {
          addTypeError(errors, path, 'an object', typeof entry);
          return;
        }
        validateAllowedKeys(entry, path, ['path', 'status', 'contentSha256', 'mutationPolicy'], errors);
        for (const key of ['path', 'status', 'contentSha256', 'mutationPolicy']) {
          if (typeof entry[key] !== 'string') addTypeError(errors, `${path}.${key}`, 'a string', typeof entry[key]);
        }
        if (typeof entry.path === 'string') {
          if (!entry.path.trim()) errors.push(`${path}.path must not be empty`);
          if (paths.has(normalizePath(entry.path).toLowerCase())) errors.push(`${path}.path is duplicated`);
          paths.add(normalizePath(entry.path).toLowerCase());
        }
        if (typeof entry.contentSha256 === 'string' && entry.contentSha256 !== 'DELETED' && !isSha256(entry.contentSha256)) {
          errors.push(`${path}.contentSha256 must be a SHA-256 hex string or DELETED`);
        }
        if (entry.mutationPolicy !== 'frozen' && entry.mutationPolicy !== 'mutable') {
          errors.push(`${path}.mutationPolicy must be frozen or mutable`);
        }
      });
    }
  }

  if (manifest.expectedBuildFlags !== undefined) {
    if (!isPlainObject(manifest.expectedBuildFlags)) addTypeError(errors, 'expectedBuildFlags', 'an object', typeof manifest.expectedBuildFlags);
    else {
      validateAllowedKeys(manifest.expectedBuildFlags, 'expectedBuildFlags', ['snapshotImportEnabled', 'snapshotPromotionEnabled'], errors);
      for (const key of ['snapshotImportEnabled', 'snapshotPromotionEnabled']) {
        if (manifest.expectedBuildFlags[key] !== undefined && typeof manifest.expectedBuildFlags[key] !== 'boolean') {
          addTypeError(errors, `expectedBuildFlags.${key}`, 'a boolean', typeof manifest.expectedBuildFlags[key]);
        }
      }
    }
  }

  if (manifest.dependencyBaseline !== undefined) {
    if (!isPlainObject(manifest.dependencyBaseline)) addTypeError(errors, 'dependencyBaseline', 'an object', typeof manifest.dependencyBaseline);
    else {
      validateAllowedKeys(manifest.dependencyBaseline, 'dependencyBaseline', [
        'packageJsonDependencies', 'packageJsonDevDependencies', 'packageLockSha256',
        'buildGradleSha256', 'appBuildGradleSha256',
      ], errors);
      for (const key of ['packageJsonDependencies', 'packageJsonDevDependencies']) {
        if (manifest.dependencyBaseline[key] !== undefined && !isPlainObject(manifest.dependencyBaseline[key])) {
          addTypeError(errors, `dependencyBaseline.${key}`, 'an object', typeof manifest.dependencyBaseline[key]);
        }
      }
      for (const key of ['packageLockSha256', 'buildGradleSha256', 'appBuildGradleSha256']) {
        if (manifest.dependencyBaseline[key] !== undefined && !isSha256(manifest.dependencyBaseline[key])) {
          errors.push(`dependencyBaseline.${key} must be a 64-character SHA-256 hex string`);
        }
      }
    }
  }

  if (manifest.targetedCommands !== undefined) {
    if (!Array.isArray(manifest.targetedCommands)) addTypeError(errors, 'targetedCommands', 'an array', typeof manifest.targetedCommands);
    else manifest.targetedCommands.forEach((step, index) => {
      const path = `targetedCommands[${index}]`;
      if (!isPlainObject(step)) {
        addTypeError(errors, path, 'an object', typeof step);
        return;
      }
      validateAllowedKeys(step, path, ['name', 'command', 'args', 'cwd'], errors);
      if (typeof step.command !== 'string' || step.command.trim() === '') addTypeError(errors, `${path}.command`, 'a non-empty string', typeof step.command);
      if (!Array.isArray(step.args) || step.args.some((arg) => typeof arg !== 'string')) addTypeError(errors, `${path}.args`, 'an array of strings', typeof step.args);
      for (const key of ['name', 'cwd']) if (step[key] !== undefined && typeof step[key] !== 'string') addTypeError(errors, `${path}.${key}`, 'a string', typeof step[key]);
    });
  }

  if (manifest.physicalEvidenceRequirements !== undefined) {
    const value = manifest.physicalEvidenceRequirements;
    if (!isPlainObject(value)) addTypeError(errors, 'physicalEvidenceRequirements', 'an object', typeof value);
    else {
      validateAllowedKeys(value, 'physicalEvidenceRequirements', [
        'logPath', 'expectedSha256', 'requiredMarkers', 'requiredPids', 'minimumTimestamp',
        'maximumTimestamp', 'expectedSize', 'requiredRuntimeFlags', 'orderedMarkerSequences',
      ], errors);
      for (const key of ['logPath', 'expectedSha256', 'minimumTimestamp', 'maximumTimestamp']) {
        if (value[key] !== undefined && typeof value[key] !== 'string') addTypeError(errors, `physicalEvidenceRequirements.${key}`, 'a string', typeof value[key]);
      }
      if (value.expectedSha256 !== undefined && !isSha256(value.expectedSha256)) errors.push('physicalEvidenceRequirements.expectedSha256 must be a SHA-256 hex string');
      for (const key of ['requiredMarkers', 'requiredPids']) if (value[key] !== undefined) validateStringArray(value[key], `physicalEvidenceRequirements.${key}`, errors);
      if (value.expectedSize !== undefined && (!Number.isInteger(value.expectedSize) || value.expectedSize < 0)) errors.push('physicalEvidenceRequirements.expectedSize must be a non-negative integer');
      if (value.requiredRuntimeFlags !== undefined) {
        if (!isPlainObject(value.requiredRuntimeFlags)) addTypeError(errors, 'physicalEvidenceRequirements.requiredRuntimeFlags', 'an object', typeof value.requiredRuntimeFlags);
        else {
          validateAllowedKeys(value.requiredRuntimeFlags, 'physicalEvidenceRequirements.requiredRuntimeFlags', ['snapshotImportEnabled', 'snapshotPromotionEnabled'], errors);
          for (const key of ['snapshotImportEnabled', 'snapshotPromotionEnabled']) if (value.requiredRuntimeFlags[key] !== undefined && typeof value.requiredRuntimeFlags[key] !== 'boolean') addTypeError(errors, `physicalEvidenceRequirements.requiredRuntimeFlags.${key}`, 'a boolean', typeof value.requiredRuntimeFlags[key]);
        }
      }
      if (value.orderedMarkerSequences !== undefined) {
        if (!Array.isArray(value.orderedMarkerSequences)) addTypeError(errors, 'physicalEvidenceRequirements.orderedMarkerSequences', 'an array of string arrays', typeof value.orderedMarkerSequences);
        else value.orderedMarkerSequences.forEach((sequence, index) => validateStringArray(sequence, `physicalEvidenceRequirements.orderedMarkerSequences[${index}]`, errors));
      }
    }
  }

  if (manifest.artifactRequirements !== undefined) {
    const value = manifest.artifactRequirements;
    if (!isPlainObject(value)) addTypeError(errors, 'artifactRequirements', 'an object', typeof value);
    else {
      validateAllowedKeys(value, 'artifactRequirements', ['distEnvChunk', 'androidEnvChunk', 'apkPath', 'expectedApkSha256', 'expectedApkSizeBytes'], errors);
      for (const key of ['distEnvChunk', 'androidEnvChunk', 'apkPath']) if (value[key] !== undefined && typeof value[key] !== 'string') addTypeError(errors, `artifactRequirements.${key}`, 'a string', typeof value[key]);
      if (value.expectedApkSha256 !== undefined && !isSha256(value.expectedApkSha256)) errors.push('artifactRequirements.expectedApkSha256 must be a SHA-256 hex string');
      if (value.expectedApkSizeBytes !== undefined && (!Number.isInteger(value.expectedApkSizeBytes) || value.expectedApkSizeBytes < 0)) errors.push('artifactRequirements.expectedApkSizeBytes must be a non-negative integer');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getGitInfo(cwd = process.cwd()) {
  try {
    const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    const branch = execFileSync('git', ['branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();

    return {
      toplevel: normalizePath(toplevel),
      branch,
      head,
    };
  } catch (err) {
    throw new Error(`Failed to query git status: ${err.message}`);
  }
}

export function parsePorcelainV1Z(statusOutput) {
  const records = statusOutput.split('\0');
  const entries = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;

    // With -z, paths are raw NUL-delimited records and are never newline-split.
    const status = record.slice(0, 2);
    const pathPart = record.slice(3);
    entries.push({ path: normalizePath(pathPart), status });

    // Porcelain v1 -z emits rename/copy as NEW_PATH\0ORIGINAL_PATH\0.
    // The original path is metadata for the same change, not a second entry.
    if (/[RC]/.test(status)) index += 1;
  }

  return entries;
}

export function getChangedEntries(cwd = process.cwd()) {
  try {
    const statusOutput = execFileSync('git', [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ], {
      cwd,
      encoding: 'utf8',
    });
    return parsePorcelainV1Z(statusOutput);
  } catch (err) {
    throw new Error(`Failed to get changed files from git: ${err.message}`);
  }
}

export function getChangedFiles(cwd = process.cwd()) {
  return getChangedEntries(cwd).map((entry) => entry.path);
}

export function getContentSha256OrDeleted(cwd, filePath) {
  const fullPath = resolve(cwd, filePath);
  if (!existsSync(fullPath)) return 'DELETED';
  try {
    if (!statSync(fullPath).isFile()) return 'DELETED';
    return computeSha256(fullPath);
  } catch (err) {
    throw new Error(`Failed to hash worktree path '${filePath}': ${err.message}`);
  }
}

function materializeChangedEntries(cwd, options = {}) {
  let entries;
  if (options.mockChangedEntries) {
    entries = options.mockChangedEntries;
  } else if (options.mockChangedFiles) {
    entries = options.mockChangedFiles.map((path) => ({ path, status: '??' }));
  } else {
    entries = getChangedEntries(cwd);
  }

  return entries.map((entry) => ({
    path: normalizePath(entry.path),
    status: entry.status || '??',
    contentSha256: entry.contentSha256 || getContentSha256OrDeleted(cwd, entry.path),
  }));
}

export function checkDiffFormatting(cwd = process.cwd()) {
  try {
    execFileSync('git', ['diff', '--check'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { passed: true };
  } catch (err) {
    return {
      passed: false,
      error: (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : ''),
    };
  }
}

export function matchPathRule(filePath, rule) {
  const normFile = normalizePath(filePath).toLowerCase();
  let normRule = normalizePath(rule).toLowerCase();

  if (normRule.endsWith('/**')) {
    normRule = normRule.slice(0, -3);
  } else if (normRule.endsWith('/*')) {
    normRule = normRule.slice(0, -2);
  }

  return normFile === normRule || normFile.startsWith(`${normRule}/`);
}

export function validatePathsAgainstRules(changedFiles, allowedPaths = [], protectedPaths = []) {
  const violations = [];

  for (const file of changedFiles) {
    // Check protected paths first (PROTECTED > ALLOWED)
    let isProtected = false;
    for (const prot of protectedPaths) {
      if (matchPathRule(file, prot)) {
        violations.push({
          file,
          reason: 'PROTECTED_PATH_VIOLATION',
          matchedRule: prot,
        });
        isProtected = true;
        break;
      }
    }
    if (isProtected) continue;

    // Check allowlist if allowedPaths is provided
    if (allowedPaths.length > 0) {
      let isAllowed = false;
      for (const allow of allowedPaths) {
        if (matchPathRule(file, allow)) {
          isAllowed = true;
          break;
        }
      }
      if (!isAllowed) {
        violations.push({
          file,
          reason: 'UNAUTHORIZED_PATH_DELTA',
        });
      }
    }
  }

  return violations;
}

function pathIsAllowed(filePath, allowedPaths = []) {
  if (allowedPaths.length === 0) return true;
  return allowedPaths.some((allow) => matchPathRule(filePath, allow));
}

function pathIsProtected(filePath, protectedPaths = []) {
  return protectedPaths.some((prot) => matchPathRule(filePath, prot));
}

function statesMatch(expected, actual) {
  return expected.status === actual.status && expected.contentSha256.toUpperCase() === actual.contentSha256.toUpperCase();
}

export function validateWorktreeBaseline(manifest, currentEntries, options = {}) {
  const phase = options.phase || 'pre';
  const allowedPaths = manifest.allowedPaths || [];
  const protectedPaths = manifest.protectedPaths || [];
  const gateType = getEffectiveGateType(manifest);
  const baseline = manifest.worktreeBaseline || [];
  const baselineByPath = new Map(baseline.map((entry) => [normalizePath(entry.path).toLowerCase(), entry]));
  const currentByPath = new Map(currentEntries.map((entry) => [normalizePath(entry.path).toLowerCase(), entry]));
  const errors = [];
  const pathViolations = [];

  if (phase !== 'pre' && phase !== 'post') {
    errors.push(`Unsupported validation phase: ${phase}`);
    return { passed: false, coveragePassed: false, errors, pathViolations, phase };
  }

  if (currentEntries.length > 0 && !Array.isArray(manifest.worktreeBaseline)) {
    errors.push('DIRTY_BASELINE_COVERAGE=FAIL: worktreeBaseline is required when the worktree is dirty');
  }

  const checkPathRules = (entry, baselineEntry) => {
    if (pathIsProtected(entry.path, protectedPaths)) {
      pathViolations.push({ file: entry.path, reason: 'PROTECTED_PATH_VIOLATION' });
      return;
    }

    // Pre-existing intrinsic paths may remain present only while frozen.
    // Their exact status/content is enforced separately by statesMatch().
    if (baselineEntry?.mutationPolicy === 'frozen') return;

    const intrinsicClassification =
      classifyIntrinsicPath(entry.path);

    if (
      !isMutationAllowedForGate(
        gateType,
        intrinsicClassification
      )
    ) {
      pathViolations.push({
        file: entry.path,
        reason:
          intrinsicClassification !== null
            ? 'INTRINSIC_GATE_SCOPE_VIOLATION:' +
              intrinsicClassification
            : 'SPECIAL_GATE_SCOPE_VIOLATION:' +
              gateType,
      });
      return;
    }

    if (baselineEntry?.mutationPolicy === 'mutable' && (allowedPaths.length === 0 || !pathIsAllowed(entry.path, allowedPaths))) {
      pathViolations.push({ file: entry.path, reason: 'MUTABLE_BASELINE_NOT_ALLOWLISTED' });
      return;
    }
    if (!baselineEntry && !pathIsAllowed(entry.path, allowedPaths)) {
      pathViolations.push({ file: entry.path, reason: 'UNAUTHORIZED_PATH_DELTA' });
    }
  };

  if (phase === 'pre') {
    for (const current of currentEntries) {
      const baselineEntry = baselineByPath.get(current.path.toLowerCase());
      if (!baselineEntry) {
        errors.push(`DIRTY_BASELINE_COVERAGE=FAIL: missing baseline entry for '${current.path}'`);
        checkPathRules(current, null);
        continue;
      }
      if (!statesMatch(baselineEntry, current)) {
        errors.push(`FROZEN_BASELINE=FAIL: '${current.path}' status/content differs from the declared pre-gate state`);
      }
      if (baselineEntry.mutationPolicy === 'mutable' && (allowedPaths.length === 0 || !pathIsAllowed(current.path, allowedPaths))) {
        errors.push(`Mutable dirty path must also be allowlisted: '${current.path}'`);
      }
      checkPathRules(current, baselineEntry);
    }
    for (const baselineEntry of baseline) {
      if (!currentByPath.has(normalizePath(baselineEntry.path).toLowerCase())) {
        errors.push(`DIRTY_BASELINE_COVERAGE=FAIL: declared baseline path is not currently dirty: '${baselineEntry.path}'`);
      }
    }
  } else {
    for (const baselineEntry of baseline) {
      const key = normalizePath(baselineEntry.path).toLowerCase();
      const current = currentByPath.get(key);
      if (baselineEntry.mutationPolicy === 'frozen' && (!current || !statesMatch(baselineEntry, current))) {
        errors.push(`FROZEN_BASELINE=FAIL: frozen path '${baselineEntry.path}' changed after the pre phase`);
      }
    }
    for (const current of currentEntries) {
      const baselineEntry = baselineByPath.get(current.path.toLowerCase());
      if (baselineEntry?.mutationPolicy === 'frozen' && !statesMatch(baselineEntry, current)) {
        errors.push(`FROZEN_BASELINE=FAIL: frozen path '${current.path}' changed after the pre phase`);
      }
      if (baselineEntry?.mutationPolicy === 'mutable' && (allowedPaths.length === 0 || !pathIsAllowed(current.path, allowedPaths))) {
        errors.push(`Mutable dirty path must also be allowlisted: '${current.path}'`);
      }
      checkPathRules(current, baselineEntry);
    }
  }

  for (const violation of pathViolations) {
    errors.push(`Path violation on '${violation.file}': ${violation.reason}`);
  }

  return {
    passed: errors.length === 0,
    coveragePassed: !errors.some((error) => error.includes('DIRTY_BASELINE_COVERAGE=FAIL')),
    errors,
    pathViolations,
    phase,
    baselineCount: baseline.length,
    currentCount: currentEntries.length,
  };
}

export function checkSemanticDependencies(packageJsonPath, baselineDependencies = null, baselineDevDependencies = null) {
  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`);
  }
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const currentDeps = pkg.dependencies || {};
  const currentDevDeps = pkg.devDependencies || {};

  const mismatches = [];

  if (baselineDependencies) {
    for (const [k, v] of Object.entries(baselineDependencies)) {
      if (currentDeps[k] !== v) {
        mismatches.push({ pkg: k, expected: v, actual: currentDeps[k], type: 'dependencies' });
      }
    }
    for (const k of Object.keys(currentDeps)) {
      if (!baselineDependencies[k]) {
        mismatches.push({ pkg: k, expected: undefined, actual: currentDeps[k], type: 'unexpected_dependency' });
      }
    }
  }

  if (baselineDevDependencies) {
    for (const [k, v] of Object.entries(baselineDevDependencies)) {
      if (currentDevDeps[k] !== v) {
        mismatches.push({ pkg: k, expected: v, actual: currentDevDeps[k], type: 'devDependencies' });
      }
    }
    for (const k of Object.keys(currentDevDeps)) {
      if (!baselineDevDependencies[k]) {
        mismatches.push({ pkg: k, expected: undefined, actual: currentDevDeps[k], type: 'unexpected_devDependency' });
      }
    }
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
  };
}

export function validateBaselineManifest(manifest, options = {}) {
  const cwd = options.cwd || process.cwd();
  const structure = validateManifestStructure(manifest);
  const results = {
    gateId: manifest?.gateId || 'UNKNOWN',
    passed: true,
    errors: [],
    details: {},
  };

  if (!structure.valid) {
    results.passed = false;
    results.errors.push(...structure.errors);
    return results;
  }

  const gatePolicy =
    validateIntrinsicGatePolicy(manifest);

  results.details.gatePolicy = gatePolicy;

  if (!gatePolicy.passed) {
    results.passed = false;
    results.errors.push(...gatePolicy.errors);
  }

  // 1. Git Canonical Info
  const gitInfo = options.mockGitInfo || getGitInfo(cwd);
  results.details.gitInfo = gitInfo;

  if (manifest.canonicalRoot) {
    const expectedRoot = normalizePath(manifest.canonicalRoot).toLowerCase();
    const actualRoot = gitInfo.toplevel.toLowerCase();
    if (expectedRoot !== actualRoot) {
      results.passed = false;
      results.errors.push(`Canonical root mismatch. Expected: ${manifest.canonicalRoot}, Actual: ${gitInfo.toplevel}`);
    }
  }

  if (manifest.expectedBranch) {
    if (gitInfo.branch !== manifest.expectedBranch) {
      results.passed = false;
      results.errors.push(`Branch mismatch. Expected: ${manifest.expectedBranch}, Actual: ${gitInfo.branch}`);
    }
  }

  if (manifest.expectedHead) {
    if (gitInfo.head.toLowerCase() !== manifest.expectedHead.toLowerCase()) {
      results.passed = false;
      results.errors.push(`HEAD commit mismatch. Expected: ${manifest.expectedHead}, Actual: ${gitInfo.head}`);
    }
  }

  // 2. Git Diff Check
  if (!options.skipDiffCheck) {
    const diffRes = options.mockDiffCheck || checkDiffFormatting(cwd);
    if (!diffRes.passed) {
      results.passed = false;
      results.errors.push(`git diff --check failed:\n${diffRes.error}`);
    }
  }

  // 3. Changed Files & Path Rules
  const changedEntries = materializeChangedEntries(cwd, options);
  results.details.changedFiles = changedEntries.map((entry) => entry.path);
  results.details.changedEntries = changedEntries;

  const baselineRes = validateWorktreeBaseline(manifest, changedEntries, { phase: options.phase || 'pre' });
  results.details.worktreeBaseline = baselineRes;
  if (!baselineRes.passed) {
    results.passed = false;
    results.details.pathViolations = baselineRes.pathViolations;
    results.errors.push(...baselineRes.errors);
  }

  // 4. Architecture Document Hashes
  if (manifest.architectureHashes) {
    results.details.architectureHashes = {};
    for (const [relPath, expectedHash] of Object.entries(manifest.architectureHashes)) {
      const fullPath = resolve(cwd, relPath);
      try {
        const actualHash = computeSha256(fullPath);
        results.details.architectureHashes[relPath] = { expected: expectedHash, actual: actualHash, match: expectedHash === actualHash };
        if (expectedHash !== actualHash) {
          results.passed = false;
          results.errors.push(`Architecture doc hash mismatch on '${relPath}'. Expected: ${expectedHash}, Actual: ${actualHash}`);
        }
      } catch (err) {
        results.passed = false;
        results.errors.push(`Failed to check architecture hash for '${relPath}': ${err.message}`);
      }
    }
  }

  // 5. Critical Source File Hashes
  if (manifest.criticalFileHashes) {
    results.details.criticalFileHashes = {};
    for (const [relPath, expectedHash] of Object.entries(manifest.criticalFileHashes)) {
      const fullPath = resolve(cwd, relPath);
      try {
        const actualHash = computeSha256(fullPath);
        results.details.criticalFileHashes[relPath] = { expected: expectedHash, actual: actualHash, match: expectedHash === actualHash };
        if (expectedHash !== actualHash) {
          results.passed = false;
          results.errors.push(`Critical file hash mismatch on '${relPath}'. Expected: ${expectedHash}, Actual: ${actualHash}`);
        }
      } catch (err) {
        results.passed = false;
        results.errors.push(`Failed to check critical file hash for '${relPath}': ${err.message}`);
      }
    }
  }

  // 6. Semantic Dependency Baseline
  if (manifest.dependencyBaseline) {
    const pkgPath = resolve(cwd, 'package.json');
    const depRes = checkSemanticDependencies(
      pkgPath,
      manifest.dependencyBaseline.packageJsonDependencies,
      manifest.dependencyBaseline.packageJsonDevDependencies
    );
    if (!depRes.passed) {
      results.passed = false;
      results.details.dependencyMismatches = depRes.mismatches;
      for (const m of depRes.mismatches) {
        results.errors.push(`Dependency mismatch on '${m.pkg}': expected=${m.expected}, actual=${m.actual} (${m.type})`);
      }
    }

    if (manifest.dependencyBaseline.packageLockSha256) {
      const lockPath = resolve(cwd, 'package-lock.json');
      const lockHash = computeSha256(lockPath);
      if (lockHash !== manifest.dependencyBaseline.packageLockSha256) {
        results.passed = false;
        results.errors.push(`package-lock.json hash mismatch. Expected: ${manifest.dependencyBaseline.packageLockSha256}, Actual: ${lockHash}`);
      }
    }

    for (const [manifestKey, relativePath] of [
      ['buildGradleSha256', 'android/build.gradle'],
      ['appBuildGradleSha256', 'android/app/build.gradle'],
    ]) {
      if (manifest.dependencyBaseline[manifestKey]) {
        const filePath = resolve(cwd, relativePath);
        try {
          const actualHash = computeSha256(filePath);
          if (actualHash !== manifest.dependencyBaseline[manifestKey]) {
            results.passed = false;
            results.errors.push(`${relativePath} hash mismatch. Expected: ${manifest.dependencyBaseline[manifestKey]}, Actual: ${actualHash}`);
          }
        } catch (err) {
          results.passed = false;
          results.errors.push(`Failed to check ${relativePath} hash: ${err.message}`);
        }
      }
    }
  }

  return results;
}

// CLI Execution
if (process.argv[1] && normalizePath(process.argv[1]) === normalizePath(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let manifestPath = null;
  let phase = 'pre';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && i + 1 < args.length) {
      manifestPath = args[i + 1];
      i++;
    } else if (args[i] === '--phase' && i + 1 < args.length) {
      phase = args[++i];
    }
  }

  if (!manifestPath) {
    console.error('ERROR: --manifest <path> argument is required');
    process.exit(1);
  }

  if (!existsSync(manifestPath)) {
    console.error(`ERROR: Manifest file not found at: ${manifestPath}`);
    process.exit(1);
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const result = validateBaselineManifest(manifest, { phase });

    if (!result.passed) {
      console.error(`\n=== BASELINE VALIDATION FAILED (Gate: ${result.gateId}) ===`);
      for (const err of result.errors) {
        console.error(`[-] ${err}`);
      }
      process.exit(1);
    }

    console.log(`=== BASELINE VALIDATION PASSED (Gate: ${result.gateId}) ===`);
    console.log(`Branch: ${result.details.gitInfo.branch}`);
    console.log(`HEAD: ${result.details.gitInfo.head}`);
    console.log(`Changed files checked: ${result.details.changedFiles.length}`);
    console.log(`DIRTY_BASELINE_COVERAGE: ${result.details.worktreeBaseline.coveragePassed ? 'PASS' : 'FAIL'}`);
    process.exit(0);
  } catch (err) {
    console.error(`FATAL ERROR during baseline validation: ${err.message}`);
    process.exit(1);
  }
}
