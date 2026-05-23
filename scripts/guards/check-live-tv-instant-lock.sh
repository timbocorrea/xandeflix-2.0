#!/usr/bin/env bash
set -u

echo "=== GUARD — LIVE TV INSTANTANEA ==="

if [ ! -f .phase-locks/live-tv-instant.sha256 ]; then
  echo "ERRO: lock .phase-locks/live-tv-instant.sha256 nao encontrado."
  exit 1
fi

echo "--- Checksum dos arquivos travados ---"
sha256sum -c .phase-locks/live-tv-instant.sha256
CHECKSUM_EXIT_CODE=$?
echo "CHECKSUM_EXIT_CODE=$CHECKSUM_EXIT_CODE"

if [ "$CHECKSUM_EXIT_CODE" -ne 0 ]; then
  echo "ERRO: algum arquivo critico da Live TV instantanea foi alterado."
  echo "Arquivos travados:"
  cat .phase-locks/live-tv-instant.sha256
  exit 1
fi

echo
echo "--- Marcadores obrigatorios da Live instantanea ---"
grep -n "readInitialLiveTvCriticalChannels" src/features/live/pages/LiveTvPage.tsx
grep -n "instantLiveChannels" src/features/live/pages/LiveTvPage.tsx
grep -n "setInstantLiveChannels" src/features/live/pages/LiveTvPage.tsx
grep -n 'status === "loading" && liveTvChannels.length === 0' src/features/live/pages/LiveTvPage.tsx
grep -n "XANDEFLIX_BOOTSTRAP_RESTORE_LIVE_CACHE" src/features/bootstrap/services/appBootstrap.service.ts
grep -n "storeCachedLiveTvCriticalChannels" src/features/bootstrap/services/appBootstrap.service.ts

echo
echo "GUARD_LIVE_TV_INSTANT_OK=1"
