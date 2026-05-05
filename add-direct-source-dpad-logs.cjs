const fs = require('fs');

const path = 'src/features/playlists/pages/DirectSourcePlaylistPage.tsx';
let content = fs.readFileSync(path, 'utf8');

function fail(message) {
  console.error('ERRO: ' + message);
  process.exit(1);
}

if (!content.includes('DIRECT_SOURCE_DPAD_DEBUG_ENABLED')) {
  const marker = "const DIRECT_SOURCE_FOCUS_RETRY_DELAYS_MS = [80, 180, 350, 700] as const;";

  if (!content.includes(marker)) {
    fail('não encontrei DIRECT_SOURCE_FOCUS_RETRY_DELAYS_MS');
  }

  content = content.replace(
    marker,
    `${marker}

const DIRECT_SOURCE_DPAD_DEBUG_ENABLED =
  (import.meta.env as Record<string, string | undefined>).VITE_SPATIAL_DEBUG ===
  'true';

function getActiveElementDebugInfo() {
  const element = document.activeElement;

  if (!(element instanceof HTMLElement)) {
    return {
      tagName: null,
      id: null,
      className: null,
      navId: null,
      text: null,
    };
  }

  return {
    tagName: element.tagName,
    id: element.id || null,
    className:
      typeof element.className === 'string' ? element.className : null,
    navId: element.dataset.navId ?? null,
    text: element.textContent?.trim().slice(0, 80) ?? null,
  };
}

function logDirectSourceDpadDebug(
  eventName: string,
  payload?: Record<string, unknown>,
) {
  if (!DIRECT_SOURCE_DPAD_DEBUG_ENABLED) {
    return;
  }

  console.log('[Xandeflix DPad][DirectSource]', eventName, {
    pathname: window.location.pathname,
    activeElement: getActiveElementDebugInfo(),
    ...payload,
  });
}`
  );
}

if (!content.includes("logDirectSourceDpadDebug('page mounted'")) {
  const marker = "export default function DirectSourcePlaylistPage() {";

  if (!content.includes(marker)) {
    fail('não encontrei DirectSourcePlaylistPage');
  }

  content = content.replace(
    marker,
    `${marker}
  useEffect(() => {
    logDirectSourceDpadDebug('page mounted');

    const handleKeyEvent = (event: KeyboardEvent) => {
      logDirectSourceDpadDebug('key event', {
        type: event.type,
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        repeat: event.repeat,
        defaultPrevented: event.defaultPrevented,
      });
    };

    const handleFocusIn = () => {
      logDirectSourceDpadDebug('dom focusin');
    };

    window.addEventListener('keydown', handleKeyEvent, true);
    window.addEventListener('keyup', handleKeyEvent, true);
    document.addEventListener('focusin', handleFocusIn, true);

    return () => {
      logDirectSourceDpadDebug('page unmounted');
      window.removeEventListener('keydown', handleKeyEvent, true);
      window.removeEventListener('keyup', handleKeyEvent, true);
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, []);`
  );
}

fs.writeFileSync(path, content);
console.log('OK: logs D-Pad adicionados em DirectSourcePlaylistPage.tsx');
