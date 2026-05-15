import { supabase } from '../../../lib/supabase/supabaseClient';

import { getCurrentAdminProfile } from './adminAccess.service';

import type { PlaybackSession } from '../types/admin.types';

type AdminPlaybackSessionLicense = {
  id: string;
  license_code: string;
  label: string | null;
  max_concurrent_streams: number;
};

export type AdminPlaybackSession = PlaybackSession & {
  license: AdminPlaybackSessionLicense | null;
};

export interface AdminEndPlaybackSessionResponse {
  ok: boolean;
  session?: PlaybackSession;
  error?: string;
  details?: string;
}

export async function listAdminActivePlaybackSessions(): Promise<
  AdminPlaybackSession[]
> {
  const adminProfile = await getCurrentAdminProfile();

  if (!adminProfile) {
    throw new Error('UNAUTHORIZED');
  }

  let licenseQuery = supabase
    .from('licenses')
    .select('id, license_code, label, max_concurrent_streams');

  if (adminProfile.role !== 'super_admin') {
    licenseQuery = licenseQuery.eq('admin_owner_id', adminProfile.id);
  }

  const { data: licenses, error: licensesError } = await licenseQuery.order(
    'created_at',
    { ascending: false },
  );

  if (licensesError) {
    throw licensesError;
  }

  const licenseRows = (licenses ?? []) as AdminPlaybackSessionLicense[];
  const licenseIds = licenseRows.map((license) => license.id);

  if (licenseIds.length === 0) {
    return [];
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('playback_sessions')
    .select('*')
    .eq('status', 'active')
    .in('license_id', licenseIds)
    .order('last_heartbeat_at', { ascending: false });

  if (sessionsError) {
    throw sessionsError;
  }

  const licensesById = new Map(
    licenseRows.map((license) => [license.id, license]),
  );

  return ((sessions ?? []) as PlaybackSession[]).map((session) => ({
    ...session,
    license: licensesById.get(session.license_id) ?? null,
  }));
}

export async function adminEndPlaybackSession(
  sessionId: string,
): Promise<PlaybackSession> {
  const { data, error } =
    await supabase.functions.invoke<AdminEndPlaybackSessionResponse>(
      'admin-end-playback-session',
      {
        body: {
          sessionId,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.session) {
    throw new Error(data?.error ?? 'ADMIN_END_PLAYBACK_SESSION_FAILED');
  }

  return data.session;
}
