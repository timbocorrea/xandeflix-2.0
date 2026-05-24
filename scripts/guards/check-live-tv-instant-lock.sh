#!/usr/bin/env bash
set -u

LOCK_FILE=".phase-locks/live-tv-instant.sha256"

echo "=== GUARD — LIVE TV INSTANTANEA ==="

if [ ! -f "$LOCK_FILE" ]; then
  echo "ERRO: lock de checksum nao encontrado: $LOCK_FILE"
  exit 1
fi

echo "--- Checksum normalizado dos arquivos travados ---"
CHECKSUM_EXIT_CODE=0

while read -r expected path; do
  clean_path="${path#\*}"

  if [ ! -f "$clean_path" ]; then
    echo "$clean_path: AUSENTE"
    CHECKSUM_EXIT_CODE=1
    continue
  fi

  actual="$(tr -d '\r' < "$clean_path" | sha256sum | awk '{print $1}')"

  if [ "$expected" = "$actual" ]; then
    echo "$clean_path: OK"
  else
    echo "$clean_path: FAILED"
    echo "EXPECTED=$expected"
    echo "ACTUAL=$actual"
    CHECKSUM_EXIT_CODE=1
  fi
done < <(tr -d '\r' < "$LOCK_FILE")

echo "CHECKSUM_EXIT_CODE=$CHECKSUM_EXIT_CODE"

if [ "$CHECKSUM_EXIT_CODE" -ne 0 ]; then
  echo "ERRO: algum arquivo critico da Live TV instantanea foi alterado."
  echo "Arquivos travados:"
  tr -d '\r' < "$LOCK_FILE"
  exit 1
fi

echo
echo "--- Marcadores obrigatorios da Live instantanea ---"

MARKERS_EXIT_CODE=0

check_marker() {
  local marker="$1"
  local file="$2"

  if ! grep -n "$marker" "$file"; then
    echo "MARCADOR_AUSENTE=$marker"
    echo "ARQUIVO=$file"
    MARKERS_EXIT_CODE=1
  fi
}

check_marker "function readInitialLiveTvCriticalChannels" src/features/live/pages/LiveTvPage.tsx
check_marker "readInitialLiveTvCriticalChannels()" src/features/live/pages/LiveTvPage.tsx
check_marker "instantLiveChannels" src/features/live/pages/LiveTvPage.tsx
check_marker "status === \"loading\" && liveTvChannels.length === 0" src/features/live/pages/LiveTvPage.tsx
check_marker "XANDEFLIX_BOOTSTRAP_RESTORE_LIVE_CACHE" src/features/bootstrap/services/appBootstrap.service.ts
check_marker "storeCachedLiveTvCriticalChannels" src/features/live/pages/LiveTvPage.tsx

if [ "$MARKERS_EXIT_CODE" -ne 0 ]; then
  echo "ERRO: marcador obrigatório da Live TV instantanea ausente."
  exit 1
fi

echo
echo "GUARD_LIVE_TV_INSTANT_OK=1"
