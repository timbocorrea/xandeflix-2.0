const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

const FILES_TO_IGNORE = new Set([]);

function walk(dir) {
  const files = [];

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      if (['node_modules', 'dist', 'android', '.git'].includes(item)) continue;
      files.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
      files.push(full);
    }
  }

  return files;
}

function classify(file, fullText, line) {
  const normalized = file.replaceAll('\\', '/');
  const trimmed = line.trim();

  if (/console\.(log|warn|error)/.test(line)) {
    if (trimmed.includes("import.meta.env.VITE_SPATIAL_DEBUG === 'true'")) {
      return 'OK_GUARDADO_POR_VITE_SPATIAL_DEBUG';
    }

    if (
      normalized.endsWith('src/lib/spatial/spatialDebug.ts') &&
      fullText.includes('VITE_SPATIAL_DEBUG')
    ) {
      return 'OK_HELPER_SPATIAL_DEBUG';
    }

    if (
      normalized.endsWith('src/features/player/lib/playerDebug.ts') &&
      fullText.includes('PLAYER_DEBUG_ENABLED') &&
      fullText.includes('if (!PLAYER_DEBUG_ENABLED)') &&
      fullText.includes('maskObjectStreamUrls')
    ) {
      return 'OK_HELPER_PLAYER_DEBUG_MASCARADO';
    }

    return 'RISCO_CONSOLE_SEM_GUARDA';
  }

  if (trimmed.includes('url: streamUrl')) {
    if (normalized.endsWith('src/features/player/pages/UniversalPlayerPage.tsx')) {
      return 'OK_FUNCIONAL_PLAYER_PRECISA_URL_REAL';
    }

    return 'RISCO_STREAM_URL_FORA_DO_PLAYER';
  }

  if (trimmed.includes('maskedStreamUrl') || trimmed.includes('maskedSourceUrl')) {
    return 'OK_URL_MASCARADA';
  }

  if (trimmed.includes('sourceUrl') || trimmed.includes('playlistUrl')) {
    if (
      normalized.includes('directSourcePlaylistLoader.ts') ||
      normalized.includes('DirectSourcePlaylistPage.tsx') ||
      normalized.includes('loadTestPlaylist.ts')
    ) {
      return 'REVISAR_USO_FUNCIONAL_DE_URL';
    }

    return 'RISCO_URL_POTENCIALMENTE_EXPOSTA';
  }

  return 'REVISAR';
}

const riskyPatterns = [
  /console\.(log|warn|error)/,
  /url:\s*streamUrl/,
  /sourceUrl/,
  /playlistUrl/,
  /maskedStreamUrl/,
  /maskedSourceUrl/,
];

const findings = [];

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file);

  if (FILES_TO_IGNORE.has(rel)) continue;

  const fullText = fs.readFileSync(file, 'utf8');
  const lines = fullText.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!riskyPatterns.some((pattern) => pattern.test(line))) return;

    const status = classify(rel, fullText, line);

    findings.push({
      file: rel,
      line: index + 1,
      status,
      text: line.trim(),
    });
  });
}

const risks = findings.filter((item) => item.status.startsWith('RISCO'));

console.log('\n=== Auditoria Xandeflix: URLs/logs sensíveis ===\n');

for (const item of findings) {
  console.log(`[${item.status}] ${item.file}:${item.line}`);
  console.log(`  ${item.text}`);
}

console.log('\nResumo:');
console.log(`Total de ocorrências analisadas: ${findings.length}`);
console.log(`Riscos reais encontrados: ${risks.length}`);

if (risks.length > 0) {
  console.log('\nItens de risco real:');
  for (const item of risks) {
    console.log(`- ${item.file}:${item.line} ${item.status}`);
  }

  process.exitCode = 1;
} else {
  console.log('\nOK: nenhum risco real encontrado pela auditoria atual.');
}
