const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function provider(status, code) {
  class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const logs = []; const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/lib/ai-provider.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: () => ({ ApiError }), process: { env: { OPENAI_API_KEY: 'test-secret' } }, FormData, AbortSignal, console: { error: (...args) => logs.push(args) }, fetch: async () => new Response(JSON.stringify({ error: { code, message: 'DO NOT LOG PRIVATE PROVIDER MESSAGE' } }), { status }), Date, Map });
  return { run: () => module.exports.openAI('responses', { store: false }), logs };
}
test('rejected provider key has a specific safe error', async () => { const p = provider(401, 'invalid_api_key'); await assert.rejects(p.run(), { code: 'AI_CREDENTIALS_REJECTED' }); assert.doesNotMatch(JSON.stringify(p.logs), /test-secret|PRIVATE PROVIDER/); });
test('exhausted credits are distinguished from temporary rate limiting', async () => { await assert.rejects(provider(429, 'insufficient_quota').run(), { code: 'AI_QUOTA_EXHAUSTED' }); await assert.rejects(provider(429, 'rate_limit_exceeded').run(), { code: 'AI_RATE_LIMITED' }); });
test('unavailable model has actionable configuration error', async () => { await assert.rejects(provider(404, 'model_not_found').run(), { code: 'AI_MODEL_UNAVAILABLE' }); });
