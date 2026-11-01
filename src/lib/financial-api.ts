import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export type Db = SupabaseClient;
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function fail(error: unknown) {
  const e = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'Unexpected API error');
  return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
}
export function ok(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function validateDb(error: { message: string; code?: string } | null) {
  if (!error) return;
  const msg = error.message;
  if (error.code === '42501' || /not authorized|unauthorized|permission denied/i.test(msg)) throw new ApiError(403, 'FORBIDDEN', 'Operation not permitted');
  if (/conflict|idempotency|duplicate|unique|overapplication|mismatch|stale/i.test(msg) || error.code === '23505') throw new ApiError(409, 'CONFLICT', msg);
  if (/invalid|must|allocation|cross-project|required|exceed/i.test(msg)) throw new ApiError(422, 'BUSINESS_RULE', msg);
  throw new ApiError(400, 'DATABASE_REJECTED', msg);
}
export async function authorized(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(header)) throw new ApiError(401, 'UNAUTHENTICATED', 'Supabase bearer token required');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiError(503, 'NOT_CONFIGURED', 'Supabase connection is not configured');
  const token = header.replace(/^Bearer\s+/i, '').trim();
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired access token');
  return { db, user: data.user };
}
export function uuid(v: unknown, key: string) {
  if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be a UUID`);
  return v;
}
export function string(v: unknown, key: string, max = 200) {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new ApiError(400, 'VALIDATION_ERROR', `${key} is required (max ${max} characters)`);
  return v.trim();
}
export function money(v: unknown, key: string, allowZero = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || (allowZero ? v < 0 : v <= 0) || !Number.isSafeInteger(Math.round(v * 100)) || Math.abs(v * 100 - Math.round(v * 100)) > 1e-7) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be a nonnegative, two-decimal currency amount`);
  return v;
}
export function date(v: unknown, key: string) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be YYYY-MM-DD`);
  return v;
}
export async function body(request: NextRequest) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'application/json required');
  if (Number(request.headers.get('content-length') || 0) > 65536) throw new ApiError(413, 'TOO_LARGE', 'Body too large');
  const raw = await request.text();
  if (raw.length > 65536) throw new ApiError(413, 'TOO_LARGE', 'Body too large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, 'INVALID_JSON', 'Invalid JSON body'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError(400, 'INVALID_JSON', 'JSON object required');
  return parsed as Record<string, unknown>;
}
export async function orgAccess(db: Db, organizationId: string) {
  const { data, error } = await db.from('organization_members').select('role').eq('organization_id', uuid(organizationId,'organization_id')).maybeSingle();
  validateDb(error);
  if (!data) throw new ApiError(403, 'FORBIDDEN', 'Organization membership required');
  return data.role as string;
}
export async function projectAccess(db: Db, projectId: string) {
  const { data, error } = await db.from('projects').select('id,organization_id,name').eq('id',uuid(projectId,'project_id')).maybeSingle();
  validateDb(error);
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Project unavailable');
  await orgAccess(db,data.organization_id);
  return data;
}
export async function readOne(db: Db, table: string, id: string) {
  const { data, error } = await db.from(table).select('*').eq('id',id).maybeSingle();
  validateDb(error);
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Record unavailable');
  return data as Record<string, unknown>;
}
export function allocations(v: unknown) {
  if (!Array.isArray(v) || !v.length || v.length > 100) throw new ApiError(400,'VALIDATION_ERROR','allocations must be a nonempty array');
  return v.map((x: unknown) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new ApiError(400,'VALIDATION_ERROR','Invalid allocation');
    const a = x as Record<string,unknown>;
    const out: Record<string,unknown> = { amount: money(a.amount,'allocation.amount') };
    if (a.phase_id !== undefined && a.phase_id !== null) out.phase_id = uuid(a.phase_id,'phase_id');
    if (a.category !== undefined) out.category = string(a.category,'category',120);
    if (a.trigger !== undefined) out.trigger = string(a.trigger,'trigger',100);
    return out;
  });
}
export async function rpc(db: Db, name: string, args: Record<string,unknown>) {
  const { data, error } = await db.rpc(name,args);
  validateDb(error);
  return uuid(data,'returned_id');
}
export async function audit(db: Db, organizationId: string, entityId: string) {
  const {data,error} = await db.from('financial_audit_events').select('id,entity_type,entity_id,action,actor_id,details,recorded_at').eq('organization_id',organizationId).eq('entity_id',entityId).order('id',{ascending:false}).limit(50);
  validateDb(error); return data;
}
