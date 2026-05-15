import { supabase } from '../../../lib/supabase/supabaseClient';

import type { AuditLog } from '../types/admin.types';

export interface CreateAuditLogInput {
  action: string;
  entity: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ListAdminAuditLogsFilters {
  action?: string;
  entity?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ListAdminAuditLogsResult {
  logs: AuditLog[];
  totalCount: number;
  page: number;
  pageSize: number;
}

const DEFAULT_AUDIT_LOGS_PAGE_SIZE = 25;
const MAX_AUDIT_LOGS_PAGE_SIZE = 100;

function normalizeOptionalFilter(value?: string) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeStartDate(value?: string) {
  if (!value) {
    return null;
  }

  return new Date(value + 'T00:00:00.000Z').toISOString();
}

function normalizeEndDate(value?: string) {
  if (!value) {
    return null;
  }

  return new Date(value + 'T23:59:59.999Z').toISOString();
}

function normalizePage(value?: number) {
  if (!value || Number.isNaN(value) || value < 1) {
    return 1;
  }

  return Math.floor(value);
}

function normalizePageSize(value?: number) {
  if (!value || Number.isNaN(value) || value < 1) {
    return DEFAULT_AUDIT_LOGS_PAGE_SIZE;
  }

  return Math.min(Math.floor(value), MAX_AUDIT_LOGS_PAGE_SIZE);
}

export async function listAdminAuditLogs(
  filters: ListAdminAuditLogsFilters = {},
): Promise<ListAdminAuditLogsResult> {
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' });

  const action = normalizeOptionalFilter(filters.action);
  const entity = normalizeOptionalFilter(filters.entity);
  const actorId = normalizeOptionalFilter(filters.actorId);
  const startDate = normalizeStartDate(filters.startDate);
  const endDate = normalizeEndDate(filters.endDate);

  if (action) {
    query = query.eq('action', action);
  }

  if (entity) {
    query = query.eq('entity', entity);
  }

  if (actorId) {
    query = query.eq('actor_id', actorId);
  }

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  return {
    logs: (data ?? []) as AuditLog[],
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

export async function createAdminAuditLog(input: CreateAuditLogInput): Promise<AuditLog> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      actor_id: user?.id ?? null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entity_id ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as AuditLog;
}
