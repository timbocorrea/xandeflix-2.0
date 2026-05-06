const fs = require('fs');

function patchFile(file, patcher) {
  if (!fs.existsSync(file)) {
    console.log(`[IGNORADO] Arquivo não encontrado: ${file}`);
    return;
  }

  const before = fs.readFileSync(file, 'utf8');
  const after = patcher(before);

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log(`[OK] Atualizado: ${file}`);
  } else {
    console.log(`[SEM ALTERAÇÃO] ${file}`);
  }
}

patchFile('src/components/tv/FocusableButton.tsx', (text) => {
  return text.replace(
    /^(\s*)console\.error\('XANDEFLIX_DPAD_TRACE \[FocusableButton\]', eventName, \{/m,
    "$1if (import.meta.env.VITE_SPATIAL_DEBUG === 'true') console.error('XANDEFLIX_DPAD_TRACE [FocusableButton]', eventName, {",
  );
});

patchFile('src/features/playlists/pages/DirectSourcePlaylistPage.tsx', (text) => {
  return text.replace(
    /^(\s*)console\.error\('XANDEFLIX_DPAD_TRACE \[DirectSource\]', eventName, \{/m,
    "$1if (import.meta.env.VITE_SPATIAL_DEBUG === 'true') console.error('XANDEFLIX_DPAD_TRACE [DirectSource]', eventName, {",
  );
});

patchFile('src/features/player/lib/playerDebug.ts', (text) => {
  let output = text;

  const importLine = "import { maskObjectStreamUrls } from '@/lib/security/maskStreamUrl';";

  if (!output.includes('const isPlayerDebugEnabled =')) {
    output = output.replace(
      importLine,
      `${importLine}

const isPlayerDebugEnabled =
  import.meta.env.DEV || import.meta.env.VITE_PLAYER_DEBUG === 'true';`,
    );
  }

  if (!output.includes('if (!isPlayerDebugEnabled) return;')) {
    output = output.replace(
      /(export function logPlayerDebugEvent[\s\S]*?\{\n)/,
      `$1  if (!isPlayerDebugEnabled) return;
`,
    );
  }

  return output;
});

console.log('\nPatch de logs/debug concluído.');
