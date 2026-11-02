const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

// Exercise route boundaries without real credentials or financial mutations.
function fixture(options = {}) {
  const calls = [];
  class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const projects = [{ id: 'project-a', name: 'Project A' }];
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return Promise.resolve({ data: projects }); } };
  const api = {
    ApiError,
    authorized: async () => { calls.push('auth'); if (options.noAuth) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in'); return { user: { id: 'actor-a' }, db: { from() { calls.push('projects'); return query; } } }; },
    orgAccess: async () => { calls.push('org'); if (options.forbidden) throw new ApiError(403, 'FORBIDDEN', 'Denied'); },
    body: async r => r.json(), string: v => v, uuid: v => v, validateDb() {},
    ok: data => NextResponse.json({ data }), fail: e => NextResponse.json({ error: { code: e.code } }, { status: e.status || 500 })
  };
  const ai = { limitAI() {}, openAI: async () => { calls.push('ai'); return { output: [{ type: 'function_call', name: 'route_financial_request', arguments: options.raw ?? JSON.stringify(options.intent ?? { action: 'lookup', project_id: 'project-a', view: 'summary', message: 'invented balance' }) }] }; } };
  const financial = { GET: async (req, ctx) => { calls.push({ token: req.headers.get('authorization'), url: req.url, path: (await ctx.params).path }); return options.apiError ? NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) : NextResponse.json({ data: { commitments: [{ amount: 10500 }], transactions: [] } }); } };
  const code = ts.transpileModule(fs.readFileSync('src/app/api/conversation/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name === 'next/server' ? { NextRequest } : name.includes('financial-api') ? api : name.includes('ai-provider') ? ai : financial, process: { env: {} }, URL, Date, JSON, Promise });
  const run = () => module.exports.POST(new NextRequest('https://example.test/api/conversation', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer actual-user-token' }, body: JSON.stringify({ message: 'Show Project A', organization_id: 'org-a' }) }));
  return { run, calls };
}
test('unauthenticated input never reaches AI or database', async () => { const f = fixture({ noAuth: true }); assert.equal((await f.run()).status, 401); assert.deepEqual(f.calls, ['auth']); });
test('organization denial stops project discovery and AI', async () => { const f = fixture({ forbidden: true }); assert.equal((await f.run()).status, 403); assert.deepEqual(f.calls, ['auth', 'org']); });
test('lookup forwards caller token to existing GET handler and returns persisted records, not AI amounts', async () => { const f = fixture(); const r = await (await f.run()).json(); assert.equal(r.data.records.commitments[0].amount, 10500); assert.equal(r.data.actor_id, 'actor-a'); assert.equal(r.data.message, 'Retrieved summary for Project A.'); assert.equal(f.calls[4].token, 'Bearer actual-user-token'); assert.match(f.calls[4].url, /financial\/context\?project_id=project-a$/); });
test('foreign project selected by model cannot execute API', async () => { const f = fixture({ intent: { action: 'lookup', project_id: 'foreign', view: 'summary' } }); assert.match((await (await f.run()).json()).data.message, /accessible project/); assert.equal(f.calls.length, 4); });
test('write intent cannot call financial API', async () => { const f = fixture({ intent: { action: 'unsupported' } }); assert.match((await (await f.run()).json()).data.message, /not enabled/); assert.equal(f.calls.length, 4); });
test('invalid operation cannot become a route or database command', async () => { const f = fixture({ intent: { action: 'lookup', project_id: 'project-a', view: 'delete' } }); assert.equal((await f.run()).status, 502); assert.equal(f.calls.length, 4); });
test('malformed tool arguments fail closed', async () => { const f = fixture({ raw: '{' }); assert.equal((await f.run()).status, 502); assert.equal(f.calls.length, 4); });
test('business API authorization error remains an error', async () => { const f = fixture({ apiError: true }); assert.equal((await f.run()).status, 403); });
test('report instruction uses only existing reports GET route', async () => { const f = fixture({ intent: { action: 'lookup', project_id: 'project-a', view: 'reports' } }); await f.run(); assert.match(f.calls[4].url, /financial\/reports\?/); });
