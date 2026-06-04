import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type StartPlaybackInput = {
  channelName: string;
  streamUrl: string;
};

export type PlaybackSession = {
  id: string;
  licenseId: string;
  licenseDeviceId: string;
  deviceIdentifier: string;
  channelName: string;
  status: string;
  startedAt: string;
  lastHeartbeatAt: string;
  expiresAt: string;
};

async function postFunction<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? 'PLAYBACK_SESSION_ERROR');
  }

  return data as T;
}

export async function startPlaybackSession(
  input: StartPlaybackInput,
): Promise<PlaybackSession> {
  const activation = getStoredLicenseActivation();

  if (!activation?.licenseCode) {
    throw new Error('LICENSE_NOT_ACTIVATED');
  }

  const deviceIdentifier = getOrCreateDeviceIdentifier();

  const result = await postFunction<{
    ok: true;
    session: PlaybackSession;
  }>('start-playback-session', {
    licenseCode: activation.licenseCode,
    deviceIdentifier,
    channelName: input.channelName,
    streamUrl: input.streamUrl,
  });

  return result.session;
}

export async function heartbeatPlaybackSession(
  sessionId: string,
): Promise<void> {
  const activation = getStoredLicenseActivation();

  if (!activation?.licenseCode) {
    return;
  }

  await postFunction('heartbeat-playback-session', {
    sessionId,
    licenseCode: activation.licenseCode,
    deviceIdentifier: getOrCreateDeviceIdentifier(),
  });
}

export async function endPlaybackSession(
  sessionId: string,
): Promise<void> {
  const activation = getStoredLicenseActivation();

  if (!activation?.licenseCode) {
    return;
  }

  await postFunction('end-playback-session', {
    sessionId,
    licenseCode: activation.licenseCode,
    deviceIdentifier: getOrCreateDeviceIdentifier(),
  });
}
