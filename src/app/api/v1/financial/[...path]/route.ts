import { NextRequest } from 'next/server';
import { authorized, orgAccess, projectAccess, readOne, allocations, rpc, audit, ok, fail, body, uuid, string, money, date, ApiError, validateDb } from '@/lib/financial-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ path: string[] }> };
const optionalUUID = (v:unknown, key:string) => v == null ? null : uuid(v,key);
function queryId(req: NextRequest, name: string) { return uuid(req.nextUrl.searchParams.get(name),name); }
async function list(db: Awaited<ReturnType<typeof authorized>>['db'], table: string, column: string, value: string) {
  const {data,error} = await db.from(table).select('*').eq(column,value).limit(500);
  validateDb(error); return data ?? [];
}
export async function GET(req: NextRequest, ctx: Params) {
  try {
    const {db} = await authorized(req), path = (await ctx.params).path.join('/');
    if (path === 'context') {
      const project = await projectAccess(db,queryId(req,'project_id'));
      const [vendors, commitments, bills, transactions, phases] = await Promise.all([
        list(db,'vendors','organization_id',project.organization_id),
        list(db,'commitments','project_id',project.id),
        list(db,'bills','project_id',project.id),
        list(db,'financial_transactions','project_id',project.id),
        list(db,'project_components','project_id',project.id)
      ]);
      return ok({project,vendors,commitments,bills,transactions,components:phases});
    }
    if (path === 'reports') {
      const project = await projectAccess(db,queryId(req,'project_id'));
      const [commitments,bills,transactions,legacyPayments] = await Promise.all([
        list(db,'commitments','project_id',project.id), list(db,'bills','project_id',project.id),
        list(db,'financial_transactions','project_id',project.id),list(db,'payments','project_id',project.id)
      ]);
      // Raw distinct ledgers, no addition of overlapping legacy payments.
      return ok({project,commitments,bills,transactions,legacy_payments:legacyPayments,aggregation:'deferred: reconcile legacy payments and new transactions before computing totals'});
    }
    if (path === 'audit') {
      const organizationId = queryId(req,'organization_id'), entityId = queryId(req,'entity_id');
      await orgAccess(db,organizationId);
      return ok({events:await audit(db,organizationId,entityId)});
    }
    throw new ApiError(404,'NOT_FOUND','Unknown financial endpoint');
  } catch(e) { return fail(e); }
}
export async function POST(req: NextRequest, ctx: Params) {
  try {
    const {db} = await authorized(req), path = (await ctx.params).path.join('/');
    const b = await body(req);
    if (path === 'bills') {
      const project = await projectAccess(db,uuid(b.project_id,'project_id'));
      const id = await rpc(db,'create_financial_bill',{p_project:project.id,p_vendor:uuid(b.vendor_id,'vendor_id'),p_amount:money(b.amount,'amount'),p_key:string(b.source_key,'source_key'),p_invoice:b.invoice_number == null?null:string(b.invoice_number,'invoice_number'),p_due:b.due_date == null?null:date(b.due_date,'due_date'),p_commitment:optionalUUID(b.commitment_id,'commitment_id')});
      return ok({bill:await readOne(db,'bills',id),audit:await audit(db,project.organization_id,id)},201);
    }
    if (path === 'transactions') {
      const project = await projectAccess(db,uuid(b.project_id,'project_id'));
      const id = await rpc(db,'record_financial_transaction',{p_project:project.id,p_vendor:optionalUUID(b.vendor_id,'vendor_id'),p_kind:string(b.kind,'kind',30),p_amount:money(b.amount,'amount'),p_date:date(b.date,'date'),p_key:string(b.source_key,'source_key'),p_allocations:allocations(b.allocations),p_cash:b.cash_effect === undefined?true:b.cash_effect === true,p_notes:b.notes==null?null:string(b.notes,'notes',2000)});
      return ok({transaction:await readOne(db,'financial_transactions',id),allocations:await list(db,'transaction_allocations','transaction_id',id),audit:await audit(db,project.organization_id,id)},201);
    }
    if (path === 'bill-payments') {
      const bill = await readOne(db,'bills',uuid(b.bill_id,'bill_id'));
      await orgAccess(db,uuid(bill.organization_id,'organization_id'));
      const transactionId = uuid(b.transaction_id,'transaction_id');
      const id = await rpc(db,'apply_bill_payment',{p_bill:bill.id,p_transaction:transactionId,p_amount:money(b.amount,'amount')});
      return ok({application:await readOne(db,'bill_applications',id),applications:await list(db,'bill_applications','bill_id',bill.id as string),audit:await audit(db,bill.organization_id as string,bill.id as string)},201);
    }
    const amendment = /^commitments\/([0-9a-f-]{36})\/amendments$/i.exec(path);
    if (amendment) {
      const current = await readOne(db,'commitments',uuid(amendment[1],'commitment_id'));
      const role = await orgAccess(db,uuid(current.organization_id,'organization_id'));
      if (role !== 'owner' && role !== 'admin') throw new ApiError(403,'FORBIDDEN','Owner or Admin required');
      const id = await rpc(db,'amend_financial_commitment',{p_id:current.id,p_new_amount:money(b.new_amount,'new_amount',true),p_allocations:allocations(b.allocations),p_expected_amount:money(b.expected_amount,'expected_amount',true)});
      return ok({commitment:await readOne(db,'commitments',id),allocations:await list(db,'commitment_allocations','commitment_id',id),audit:await audit(db,current.organization_id as string,id)});
    }
    throw new ApiError(404,'NOT_FOUND','Unknown financial endpoint');
  } catch(e) { return fail(e); }
}
