export type AdminRole = 'admin' | 'super_admin';

export type ClientStatus = 'active' | 'inactive' | 'expired' | 'blocked';

export type IptvSourceType = 'm3u' | 'xtream' | 'manual';

export interface AdminProfile {
  id: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  client_id: string;
  device_name: string | null;
  device_identifier: string | null;
  platform: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IptvSource {
  id: string;
  client_id: string | null;
  name: string;
  source_url: string;
  type: IptvSourceType;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelCache {
  id: string;
  iptv_source_id: string;
  name: string;
  logo_url: string | null;
  group_title: string | null;
  stream_url: string;
  tvg_id: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
