const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

function fixture(options = {}) {
  let upstreamCalls = 0;
  class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const api = { ApiError,
    authorized: async () => { if (options.noAuth) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in'); return { user: { id: 'actor' } }; },
    ok: data => NextResponse.json({ data }), fail: e => NextResponse.json({ error: { code: e.code } }, { status: e.status || 500 })
  };
  const ai = { limitAI() {}, aiKey() {}, openAI: async (path, form) => { upstreamCalls++; assert.equal(path, 'audio/transcriptions'); assert.equal(form.get('model'), 'gpt-4o-mini-transcribe'); assert.equal(form.get('file').name, 'instruction.m4a'); return { text: options.silence ? '' : ' Show Project A ' }; } };
  const code = ts.transpileModule(fs.readFileSync('src/app/api/transcription/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name.includes('financial-api') ? api : ai, process: { env: {} }, Response, File, FormData, Buffer });
  return { run: req => module.exports.POST(req), calls: () => upstreamCalls };
}
const audioRequest = (type = 'audio/mp4', size = 20) => {
  const form = new FormData(); form.set('audio', new Blob([new Uint8Array(size)], { type }), 'instruction.m4a');
  return new NextRequest('https://example.test/api/transcription', { method: 'POST', body: form });
};
test('audio upload requires an authenticated identity before transcription', async () => { const f = fixture({ noAuth: true }); assert.equal((await f.run(audioRequest())).status, 401); assert.equal(f.calls(), 0); });
test('MP4 recording is forwarded with M4A extension and transcription is returned', async () => { const f = fixture(); const r = await f.run(audioRequest()); assert.equal(r.status, 200); assert.equal((await r.json()).data.text, 'Show Project A'); assert.equal(f.calls(), 1); });
test('non-audio upload cannot reach transcription provider', async () => { const f = fixture(); assert.equal((await f.run(audioRequest('text/html'))).status, 400); assert.equal(f.calls(), 0); });
test('streamed oversized upload is rejected without trusting content-length', async () => {
  const f = fixture();
  const req = { headers: new Headers({ 'content-type': 'multipart/form-data; boundary=test' }), body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024 + 1)); } }) };
  assert.equal((await f.run(req)).status, 413); assert.equal(f.calls(), 0);
});
test('empty speech does not become a financial instruction', async () => { const f = fixture({ silence: true }); assert.equal((await f.run(audioRequest())).status, 422); });
