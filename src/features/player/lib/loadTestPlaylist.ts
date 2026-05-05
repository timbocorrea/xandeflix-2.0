import { analyzeM3uPlaylist } from './analyzeM3uPlaylist';
import { parseM3uPlaylist } from './parseM3uPlaylist';
import type { LoadedPlaylist } from '../types/playlist';

const PLACEHOLDER_PLAYLIST_URL = 'COLE_AQUI_SUA_URL_DA_LISTA';

export function getTestPlaylistUrl() {
  return import.meta.env.VITE_TEST_IPTV_PLAYLIST_URL?.trim() ?? '';
}

export function hasConfiguredTestPlaylistUrl() {
  const playlistUrl = getTestPlaylistUrl();

  return playlistUrl.length > 0 && playlistUrl !== PLACEHOLDER_PLAYLIST_URL;
}

export async function loadTestPlaylist(): Promise<LoadedPlaylist> {
  const playlistUrl = getTestPlaylistUrl();

  if (!hasConfiguredTestPlaylistUrl()) {
    throw new Error('URL da playlist IPTV de teste não configurada.');
  }

  const response = await fetch(playlistUrl, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `Falha ao carregar playlist IPTV. HTTP ${response.status}.`,
    );
  }

  const content = await response.text();
  const diagnostics = analyzeM3uPlaylist(content);
  const channels = parseM3uPlaylist(content);

  return {
    channels,
    total: channels.length,
    diagnostics,
  };
}
