const fs = require('fs');

const buttonPath = 'src/components/tv/FocusableButton.tsx';
const pagePath = 'src/features/playlists/pages/DirectSourcePlaylistPage.tsx';

let button = fs.readFileSync(buttonPath, 'utf8');
let page = fs.readFileSync(pagePath, 'utf8');

function fail(message) {
  console.error('ERRO: ' + message);
  process.exit(1);
}

function replaceOrFail(content, search, replace, label) {
  if (!content.includes(search)) {
    fail('não encontrei: ' + label);
  }

  console.log('OK: ' + label);
  return content.replace(search, replace);
}

/**
 * 1. FocusableButton: importar setFocus
 */
if (!button.includes('setFocus')) {
  button = replaceOrFail(
    button,
    "import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';",
    "import {\n  setFocus,\n  useFocusable,\n} from '@noriginmedia/norigin-spatial-navigation';",
    'import setFocus no FocusableButton',
  );
}

/**
 * 2. FocusableButton: logs fortes para logcat
 */
button = button.replaceAll(
  "console.log('[Xandeflix DPad][FocusableButton]', eventName, {",
  "console.error('XANDEFLIX_DPAD_TRACE [FocusableButton]', eventName, {",
);

/**
 * 3. FocusableButton: helper específico temporário para ponte vertical da tela Canais
 */
if (!button.includes('DIRECT_SOURCE_TOP_FOCUS_KEYS')) {
  button = replaceOrFail(
    button,
    "const DPAD_DEBUG_ENABLED =\n  (import.meta.env as Record<string, string | undefined>).VITE_SPATIAL_DEBUG ===\n  'true';",
    `const DPAD_DEBUG_ENABLED =
  (import.meta.env as Record<string, string | undefined>).VITE_SPATIAL_DEBUG ===
  'true';

const DIRECT_SOURCE_TOP_FOCUS_KEYS = new Set([
  'direct-source-load-button',
  'direct-source-clear-button',
  'direct-source-player-button',
]);

function setCurrentSpatialFocusKey(focusKey: string) {
  (
    window as Window & {
      __XANDEFLIX_CURRENT_FOCUS_KEY?: string;
    }
  ).__XANDEFLIX_CURRENT_FOCUS_KEY = focusKey;
}

function focusDirectSourceUrlInput() {
  const input = document.querySelector<HTMLInputElement>(
    '[data-nav-id="direct-source-url-input"]',
  );

  if (!input) {
    console.error('XANDEFLIX_DPAD_TRACE [FocusableButton]', 'url input not found');
    return false;
  }

  input.focus({ preventScroll: true });
  input.select();

  (
    window as Window & {
      __XANDEFLIX_CURRENT_FOCUS_KEY?: string;
    }
  ).__XANDEFLIX_CURRENT_FOCUS_KEY = 'direct-source-url-input';

  console.error('XANDEFLIX_DPAD_TRACE [FocusableButton]', 'forced url input focus');

  return true;
}

function handleDirectSourceVerticalBridge(
  focusKey: string,
  direction: string,
) {
  if (window.location.pathname !== '/playlists/direct-source') {
    return false;
  }

  if (!DIRECT_SOURCE_TOP_FOCUS_KEYS.has(focusKey)) {
    return false;
  }

  if (direction === 'up') {
    return focusDirectSourceUrlInput();
  }

  if (direction === 'down') {
    const firstChannel = document.querySelector(
      '[data-nav-id="direct-source-channel-0"]',
    );

    if (!firstChannel) {
      console.error(
        'XANDEFLIX_DPAD_TRACE [FocusableButton]',
        'no first channel to focus',
      );
      return false;
    }

    setFocus('direct-source-channel-0');

    console.error(
      'XANDEFLIX_DPAD_TRACE [FocusableButton]',
      'forced first channel focus',
    );

    return true;
  }

  return false;
}`,
    'helpers de ponte vertical no FocusableButton',
  );
}

/**
 * 4. FocusableButton: registrar último foco espacial
 */
if (!button.includes('setCurrentSpatialFocusKey(focusKey);')) {
  button = replaceOrFail(
    button,
    "    onFocus: () => {",
    "    onFocus: () => {\n      setCurrentSpatialFocusKey(focusKey);",
    'registrar foco atual',
  );
}

/**
 * 5. FocusableButton: interceptar ArrowUp/ArrowDown antes da navegação padrão
 */
if (!button.includes('handleDirectSourceVerticalBridge(focusKey, direction)')) {
  button = replaceOrFail(
    button,
    "      if (onArrowPress) {",
    "      if (handleDirectSourceVerticalBridge(focusKey, direction)) {\n        return false;\n      }\n\n      if (onArrowPress) {",
    'interceptar navegação vertical',
  );
}

/**
 * 6. DirectSourcePage: log forte para logcat
 */
page = page.replaceAll(
  "console.log('[Xandeflix DPad][DirectSource]', eventName, {",
  "console.error('XANDEFLIX_DPAD_TRACE [DirectSource]', eventName, {",
);

/**
 * 7. DirectSourcePage: criar focusKey do input
 */
if (!page.includes('DIRECT_SOURCE_URL_INPUT_FOCUS_KEY')) {
  page = replaceOrFail(
    page,
    "const DIRECT_SOURCE_INITIAL_FOCUS_KEY = 'direct-source-load-button';",
    "const DIRECT_SOURCE_URL_INPUT_FOCUS_KEY = 'direct-source-url-input';\n\nconst DIRECT_SOURCE_INITIAL_FOCUS_KEY = 'direct-source-load-button';",
    'constante do input URL',
  );
}

/**
 * 8. DirectSourcePage: adicionar data-nav-id/tabIndex/onFocus no primeiro input
 */
if (!page.includes('data-nav-id={DIRECT_SOURCE_URL_INPUT_FOCUS_KEY}')) {
  page = page.replace(
    /<input\s+/,
    `<input
                data-nav-id={DIRECT_SOURCE_URL_INPUT_FOCUS_KEY}
                tabIndex={0}
                onFocus={() => {
                  logDirectSourceDpadDebug('url input dom focus');
                }}
                `,
  );

  console.log('OK: atributos focáveis no input URL');
}

/**
 * 9. DirectSourcePage: quando o input estiver focado, ArrowDown volta para Carregar direto
 */
if (!page.includes("reason: 'ArrowDown from URL input DOM'")) {
  const search = `const handleKeyEvent = (event: KeyboardEvent) => {
      logDirectSourceDpadDebug('key event', {
        type: event.type,
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        repeat: event.repeat,
        defaultPrevented: event.defaultPrevented,
      });
    };`;

  const replace = `const handleKeyEvent = (event: KeyboardEvent) => {
      const target =
        event.target instanceof HTMLElement ? event.target : null;

      const targetNavId = target?.dataset.navId ?? null;

      logDirectSourceDpadDebug('key event', {
        type: event.type,
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        repeat: event.repeat,
        defaultPrevented: event.defaultPrevented,
        targetNavId,
      });

      if (event.type !== 'keydown') {
        return;
      }

      if (
        event.key === 'ArrowDown' &&
        targetNavId === DIRECT_SOURCE_URL_INPUT_FOCUS_KEY
      ) {
        event.preventDefault();
        event.stopPropagation();

        logDirectSourceDpadDebug('forced focus move', {
          from: DIRECT_SOURCE_URL_INPUT_FOCUS_KEY,
          to: 'direct-source-load-button',
          reason: 'ArrowDown from URL input DOM',
        });

        target?.blur();
        setFocus('direct-source-load-button');
      }
    };`;

  page = replaceOrFail(
    page,
    search,
    replace,
    'ArrowDown do input URL para botão Carregar direto',
  );
}

fs.writeFileSync(buttonPath, button);
fs.writeFileSync(pagePath, page);

console.log('OK: ponte vertical D-Pad aplicada.');
