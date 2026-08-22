#!/usr/bin/env node

/**
 * Xandeflix 2.0 - Mechanical Safety Barrier
 * Semantic Bundle Flag & Triple Identity Verifier
 *
 * Evaluates compiled Vite chunks via isolated Node.js child processes
 * using dynamic import() and semantic AST/export evaluation.
 * Prohibits naive substring/grep matches to prevent Incident B.6E regressions.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { computeSha256, normalizePath, validateManifestStructure } from './check-baseline.mjs';

/**
 * Evaluates an ESM chunk in an isolated Node child process to extract boolean flags.
 * Output contains exclusively sanitized JSON: { "snapshotImport": boolean, "snapshotPromotion": boolean }
 */
export function evaluateEsmChunkSemantics(chunkPath) {
  if (!existsSync(chunkPath)) {
    throw new Error(`Chunk file not found at: ${chunkPath}`);
  }

  const fileUrl = pathToFileURL(resolve(chunkPath)).href;

  // Evaluation script executed in fresh child process
  const evaluatorScript = `
    const fileUrl = ${JSON.stringify(fileUrl)};
    try {
      const mod = await import(fileUrl);
      let foundConfig = null;

      // Scan module exports
      for (const [key, val] of Object.entries(mod)) {
        if (val && typeof val === 'object') {
          if ('localCatalogSnapshotImportEnabled' in val && 'localCatalogSnapshotPromotionEnabled' in val) {
            foundConfig = val;
            break;
          }
        }
      }

      if (!foundConfig) {
        // Fallback: check if the default export or module itself is the config
        if ('localCatalogSnapshotImportEnabled' in mod && 'localCatalogSnapshotPromotionEnabled' in mod) {
          foundConfig = mod;
        }
      }

      if (!foundConfig) {
        console.error(JSON.stringify({ error: 'NO_CONFIG_OBJECT_FOUND' }));
        process.exit(2);
      }

      const importVal = foundConfig.localCatalogSnapshotImportEnabled;
      const promoVal = foundConfig.localCatalogSnapshotPromotionEnabled;

      if (typeof importVal !== 'boolean' || typeof promoVal !== 'boolean') {
        console.error(JSON.stringify({ error: 'NON_BOOLEAN_FLAG_VALUE', importVal: typeof importVal, promoVal: typeof promoVal }));
        process.exit(3);
      }

      const result = {
        snapshotImport: importVal,
        snapshotPromotion: promoVal
      };

      console.log(JSON.stringify(result));
      process.exit(0);
    } catch (err) {
      console.error(JSON.stringify({ error: 'IMPORT_EXECUTION_FAILED', message: err.message }));
      process.exit(1);
    }
  `;

  try {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', evaluatorScript], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const parsed = JSON.parse(output.trim());
    return {
      success: true,
      flags: parsed,
    };
  } catch (err) {
    let errorDetail = 'Child process execution failed';
    if (err.stderr) {
      try {
        const parsedErr = JSON.parse(err.stderr.toString().trim());
        errorDetail = parsedErr.error || parsedErr.message || err.stderr.toString();
      } catch (_) {
        errorDetail = err.stderr.toString().trim();
      }
    }
    return {
      success: false,
      error: errorDetail,
    };
  }
}

/**
 * Extracts a chunk from APK using JDK jar tool into a temporary directory
 */
export function extractChunkFromApk(apkPath, chunkName = 'env-') {
  if (!existsSync(apkPath)) {
    throw new Error(`APK file not found at: ${apkPath}`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'xandeflix-apk-extract-'));

  try {
    // List files inside APK
    const listOutput = execFileSync('jar', ['tf', resolve(apkPath)], {
      encoding: 'utf8',
    });

    const lines = listOutput.split(/\r?\n/);
    const targetEntry = lines.find((l) => l.includes('assets/public/assets/') && l.includes(chunkName) && l.endsWith('.js'));

    if (!targetEntry) {
      throw new Error(`Could not locate ${chunkName}*.js entry inside APK`);
    }

    // Extract specific file
    execFileSync('jar', ['xf', resolve(apkPath), targetEntry.trim()], {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const extractedPath = resolve(tempDir, targetEntry.trim());
    if (!existsSync(extractedPath)) {
      throw new Error(`Failed to extract entry to: ${extractedPath}`);
    }

    return {
      tempDir,
      extractedPath,
      entryName: targetEntry.trim(),
      cleanup: () => {
        try {
          rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
      },
    };
  } catch (err) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
    throw new Error(`APK extraction failed: ${err.message}`);
  }
}

/**
 * Comprehensive verification of Dist, Android Assets and APK bundle flags
 */
export function verifyBundleFlags({ distEnvChunk, androidEnvChunk, apkPath, expectedImport, expectedPromotion, expectedApkSha256 = null, expectedApkSizeBytes = null }) {
  const report = {
    passed: true,
    tripleByteIdentity: false,
    semanticEvaluation: false,
    errors: [],
    details: {},
  };

  // 1. Dist Chunk Check
  if (!existsSync(distEnvChunk)) {
    report.passed = false;
    report.errors.push(`Dist env chunk not found: ${distEnvChunk}`);
    return report;
  }
  const distSha = computeSha256(distEnvChunk);
  const distEval = evaluateEsmChunkSemantics(distEnvChunk);
  report.details.dist = { sha256: distSha, evaluation: distEval };

  if (!distEval.success) {
    report.passed = false;
    report.errors.push(`Dist chunk semantic evaluation failed: ${distEval.error}`);
  } else if (distEval.flags.snapshotImport !== expectedImport || distEval.flags.snapshotPromotion !== expectedPromotion) {
    report.passed = false;
    report.errors.push(`Dist chunk semantic flag mismatch: got import=${distEval.flags.snapshotImport}, promotion=${distEval.flags.snapshotPromotion}; expected import=${expectedImport}, promotion=${expectedPromotion}`);
  }

  // 2. Android Assets Chunk Check
  if (androidEnvChunk) {
    if (!existsSync(androidEnvChunk)) {
      report.passed = false;
      report.errors.push(`Android assets env chunk not found: ${androidEnvChunk}`);
    } else {
      const androidSha = computeSha256(androidEnvChunk);
      const androidEval = evaluateEsmChunkSemantics(androidEnvChunk);
      report.details.android = { sha256: androidSha, evaluation: androidEval };

      if (!androidEval.success) {
        report.passed = false;
        report.errors.push(`Android assets chunk semantic evaluation failed: ${androidEval.error}`);
      } else if (androidEval.flags.snapshotImport !== expectedImport || androidEval.flags.snapshotPromotion !== expectedPromotion) {
        report.passed = false;
        report.errors.push(`Android chunk semantic flag mismatch: got import=${androidEval.flags.snapshotImport}, promotion=${androidEval.flags.snapshotPromotion}`);
      }

      if (distSha !== androidSha) {
        report.passed = false;
        report.errors.push(`Dist and Android asset chunk hash mismatch: dist=${distSha}, android=${androidSha}`);
      }
    }
  }

  // 3. APK Internal Chunk Check
  if (apkPath) {
    let apkExtraction = null;
    let identityValid = true;
    try {
      if (existsSync(apkPath)) {
        const apkSha256 = computeSha256(apkPath);
        const apkSizeBytes = statSync(apkPath).size;
        report.details.apkIdentity = {
          sha256: apkSha256,
          sizeBytes: apkSizeBytes,
          expectedSha256: expectedApkSha256,
          expectedSizeBytes: expectedApkSizeBytes,
        };
        if (expectedApkSha256 && apkSha256.toUpperCase() !== expectedApkSha256.toUpperCase()) {
          identityValid = false;
          report.passed = false;
          report.errors.push(`APK SHA256 mismatch. Expected: ${expectedApkSha256}, Actual: ${apkSha256}`);
        }
        if (expectedApkSizeBytes !== null && apkSizeBytes !== expectedApkSizeBytes) {
          identityValid = false;
          report.passed = false;
          report.errors.push(`APK size mismatch. Expected: ${expectedApkSizeBytes}, Actual: ${apkSizeBytes}`);
        }
      }

      if (identityValid) {
        apkExtraction = extractChunkFromApk(apkPath);
        const apkChunkSha = computeSha256(apkExtraction.extractedPath);
        const apkEval = evaluateEsmChunkSemantics(apkExtraction.extractedPath);
        report.details.apk = { sha256: apkChunkSha, evaluation: apkEval, entry: apkExtraction.entryName };

        if (!apkEval.success) {
          report.passed = false;
          report.errors.push(`APK chunk semantic evaluation failed: ${apkEval.error}`);
        } else if (apkEval.flags.snapshotImport !== expectedImport || apkEval.flags.snapshotPromotion !== expectedPromotion) {
          report.passed = false;
          report.errors.push(`APK chunk semantic flag mismatch: got import=${apkEval.flags.snapshotImport}, promotion=${apkEval.flags.snapshotPromotion}`);
        }

        if (distSha !== apkChunkSha) {
          report.passed = false;
          report.errors.push(`Dist and APK internal chunk hash mismatch: dist=${distSha}, apk=${apkChunkSha}`);
        }
      }
    } catch (err) {
      report.passed = false;
      report.errors.push(`APK chunk verification failed: ${err.message}`);
    } finally {
      if (apkExtraction) {
        apkExtraction.cleanup();
      }
    }
  }

  // Triple Byte Identity calculation
  const hasAndroid = !!report.details.android;
  const hasApk = !!report.details.apk;
  if (hasAndroid && hasApk) {
    report.tripleByteIdentity = (
      report.details.dist.sha256 === report.details.android.sha256 &&
      report.details.dist.sha256 === report.details.apk.sha256
    );
  } else {
    report.tripleByteIdentity = false;
  }

  report.semanticEvaluation = (
    distEval.success &&
    (!report.details.android || report.details.android.evaluation.success) &&
    (!report.details.apk || report.details.apk.evaluation.success)
  );

  return report;
}

// CLI Execution
if (process.argv[1] && normalizePath(process.argv[1]) === normalizePath(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let distEnvChunk = null;
  let androidEnvChunk = null;
  let apkPath = null;
  let expectedImport = true;
  let expectedPromotion = false;
  let expectedApkSha256 = null;
  let expectedApkSizeBytes = null;
  let manifestPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && i + 1 < args.length) manifestPath = args[++i];
    else if (args[i] === '--dist-chunk' && i + 1 < args.length) distEnvChunk = args[++i];
    else if (args[i] === '--android-chunk' && i + 1 < args.length) androidEnvChunk = args[++i];
    else if (args[i] === '--apk' && i + 1 < args.length) apkPath = args[++i];
    else if (args[i] === '--expected-import' && i + 1 < args.length) expectedImport = args[++i] === 'true';
    else if (args[i] === '--expected-promotion' && i + 1 < args.length) expectedPromotion = args[++i] === 'true';
    else if (args[i] === '--expected-apk-sha256' && i + 1 < args.length) expectedApkSha256 = args[++i];
    else if (args[i] === '--expected-apk-size' && i + 1 < args.length) expectedApkSizeBytes = Number(args[++i]);
  }

  if (manifestPath && existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const structure = validateManifestStructure(manifest);
    if (!structure.valid) {
      console.error('ERROR: Invalid manifest structure');
      for (const error of structure.errors) console.error(`[-] ${error}`);
      process.exit(1);
    }
    if (manifest.artifactRequirements) {
      distEnvChunk = distEnvChunk || manifest.artifactRequirements.distEnvChunk;
      androidEnvChunk = androidEnvChunk || manifest.artifactRequirements.androidEnvChunk;
      apkPath = apkPath || manifest.artifactRequirements.apkPath;
      expectedApkSha256 = expectedApkSha256 || manifest.artifactRequirements.expectedApkSha256 || null;
      expectedApkSizeBytes = expectedApkSizeBytes ?? manifest.artifactRequirements.expectedApkSizeBytes ?? null;
    }
    if (manifest.expectedBuildFlags) {
      expectedImport = manifest.expectedBuildFlags.snapshotImportEnabled;
      expectedPromotion = manifest.expectedBuildFlags.snapshotPromotionEnabled;
    }
  }

  if (!distEnvChunk) {
    console.error('ERROR: --dist-chunk <path> or --manifest <path> with artifactRequirements is required');
    process.exit(1);
  }

  const result = verifyBundleFlags({
    distEnvChunk,
    androidEnvChunk,
    apkPath,
    expectedImport,
    expectedPromotion,
    expectedApkSha256,
    expectedApkSizeBytes,
  });

  if (!result.passed) {
    console.error('\n=== BUNDLE FLAG & IDENTITY VERIFICATION FAILED ===');
    for (const err of result.errors) {
      console.error(`[-] ${err}`);
    }
    process.exit(1);
  }

  console.log('=== BUNDLE FLAG & IDENTITY VERIFICATION PASSED ===');
  console.log(`DIST_ENV_CHUNK_SHA256: ${result.details.dist.sha256}`);
  if (result.details.android) console.log(`ANDROID_ENV_CHUNK_SHA256: ${result.details.android.sha256}`);
  if (result.details.apk) console.log(`APK_ENV_CHUNK_SHA256: ${result.details.apk.sha256}`);
  console.log(`TRIPLE_BYTE_IDENTITY: ${result.tripleByteIdentity ? 'SIM' : 'NAO'}`);
  console.log(`SEMANTIC_FLAGS: snapshotImport=${expectedImport}, snapshotPromotion=${expectedPromotion}`);
  process.exit(0);
}
