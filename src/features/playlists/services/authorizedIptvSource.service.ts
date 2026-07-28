import { env } from '@/config/env';
import { supabase } from '@/lib/supabase/supabaseClient';

import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import type {
  PlaylistRuntimeAuthorizationContext,
  PlaylistSource,
} from '../types/playlist';

export type AuthorizedIptvSourceMode = 'license' | 'legacy';

export type AuthorizedIptvSource = {
  mode?: AuthorizedIptvSourceMode;
  license?: {
    id: string;
    code: string;
    status: string;
    expiresAt: string | null;
  };
  client?: {
    id: string;
    name: string;
    status: string;
    expiresAt: string | null;
  };
  device: {
    id: string;
    name?: string | null;
    identifier?: string | null;
    deviceIdentifier?: string | null;
    platform: string | null;
  };
  source: {
    id: string;
    name: string;
    type: 'm3u' | 'xtream' | 'manual';
    url: string;
  };
};

type GetAuthorizedIptvSourceSuccessResponse = {
  ok: true;
} & AuthorizedIptvSource;

type GetAuthorizedIptvSourceErrorResponse = {
  ok?: false;
  error?: string;
  details?: string;
  status?: string;
};

type GetAuthorizedIptvSourceResponse =
  | GetAuthorizedIptvSourceSuccessResponse
  | GetAuthorizedIptvSourceErrorResponse;

function isAuthorizedIptvSourceSuccess(
  data: GetAuthorizedIptvSourceResponse | null,
): data is GetAuthorizedIptvSourceSuccessResponse {
  return Boolean(data?.ok);
}

async function postAuthorizedIptvSource(input: {
  deviceIdentifier: string;
  licenseCode?: string;
  accessToken?: string;
}): Promise<AuthorizedIptvSource> {
  const headers: Record<string, string> = {
    apikey: env.supabaseAnonKey,
    'Content-Type': 'application/json',
  };

  if (input.accessToken) {
    headers.Authorization = `Bearer ${input.accessToken}`;
  }

  console.info('[XANDEFLIX_LICENSE_AUTH_REQUEST]', {
    hasLicenseCode: Boolean(input.licenseCode),
    hasAccessToken: Boolean(input.accessToken),
  });

  const response = await fetch(
    `${env.supabaseUrl}/functions/v1/get-authorized-iptv-source`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceIdentifier: input.deviceIdentifier,
        licenseCode: input.licenseCode,
      }),
    },
  );

  const data = (await response.json().catch(() => null)) as
    | GetAuthorizedIptvSourceResponse
    | null;

  if (!response.ok || !isAuthorizedIptvSourceSuccess(data)) {
    throw new Error('AUTHORIZED_IPTV_SOURCE_UNAVAILABLE');
  }

  return {
    mode: data.mode,
    license: data.license,
    client: data.client,
    device: data.device,
    source: data.source,
  };
}

export async function getAuthorizedIptvSource(input: {
  deviceIdentifier: string;
  licenseCode?: string;
}): Promise<AuthorizedIptvSource> {
  const normalizedDeviceIdentifier = input.deviceIdentifier.trim();
  const explicitLicenseCode = input.licenseCode?.trim().toUpperCase();

  if (!normalizedDeviceIdentifier) {
    throw new Error('Identificador do dispositivo não informado.');
  }

  const storedActivation = getStoredLicenseActivation();

  if (explicitLicenseCode) {
    return postAuthorizedIptvSource({
      deviceIdentifier: normalizedDeviceIdentifier,
      licenseCode: explicitLicenseCode,
    });
  }

  if (
    storedActivation?.licenseCode?.trim() &&
    storedActivation.deviceIdentifier === normalizedDeviceIdentifier
  ) {
    return postAuthorizedIptvSource({
      deviceIdentifier: normalizedDeviceIdentifier,
      licenseCode: storedActivation.licenseCode.trim().toUpperCase(),
    });
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error(
      'Licença não ativada neste dispositivo e sessão do usuário não encontrada.',
    );
  }

  return postAuthorizedIptvSource({
    deviceIdentifier: normalizedDeviceIdentifier,
    accessToken: session.access_token,
  });
}

export function mapAuthorizedIptvSourceToPlaylistSource(
  authorizedSource: AuthorizedIptvSource,
): PlaylistSource {
  return {
    url: authorizedSource.source.url,
    name: authorizedSource.source.name,
    sourceId: authorizedSource.source.id,
    sourceType: authorizedSource.source.type,
  };
}

export function mapAuthorizedIptvSourceToRuntimeAuthorizationContext(
  authorizedSource: AuthorizedIptvSource,
): PlaylistRuntimeAuthorizationContext | null {
  const internalLicenseId = authorizedSource.license?.id.trim() ?? '';

  return internalLicenseId ? { internalLicenseId } : null;
}
