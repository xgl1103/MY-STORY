import assert from 'node:assert/strict';
import handler from '../api/ai.js';

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

async function invoke(body, method = 'POST') {
  const res = responseRecorder();
  await handler({ method, body, headers: { 'x-forwarded-for': 'test-client' }, socket: {} }, res);
  return res;
}

const originalFetch = globalThis.fetch;
const originalKey = process.env.DEEPSEEK_API_KEY;

try {
  delete process.env.DEEPSEEK_API_KEY;
  let result = await invoke({ action: 'health' });
  assert.equal(result.statusCode, 503);
  assert.equal(result.payload.configured, false);

  process.env.DEEPSEEK_API_KEY = 'unit-test-key';
  result = await invoke({ action: 'health' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.configured, true);

  let upstreamCalls = 0;
  globalThis.fetch = async (url, options) => {
    upstreamCalls += 1;
    assert.equal(url, 'https://api.deepseek.com/v1/chat/completions');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'deepseek-chat');
    if (upstreamCalls === 1) {
      assert.equal(payload.max_tokens, 3200, 'token count should be capped');
      assert.equal(payload.response_format, undefined, 'normal chat must not force JSON mode');
    } else {
      assert.equal(payload.max_tokens, 200, 'JSON mode must preserve a valid requested budget');
      assert.deepEqual(payload.response_format, { type: 'json_object' }, 'JSON chat must request a JSON object');
    }
    assert.equal(options.headers.Authorization, 'Bearer unit-test-key');
    return new Response(JSON.stringify({
      choices: [{ message: { content: '  serverless response  ' } }],
      usage: { total_tokens: 42 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  result = await invoke({
    action: 'chat', systemPrompt: 'system', userPrompt: 'user', maxTokens: 9999, temperature: 0.8,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.content, 'serverless response');
  assert.equal(result.payload.tokensUsed, 42);
  assert.equal(result.headers['Cache-Control'], 'no-store');

  result = await invoke({
    action: 'chat', systemPrompt: 'system', userPrompt: 'user', maxTokens: 200, jsonMode: true,
  });
  assert.equal(result.statusCode, 200);

  result = await invoke({ action: 'chat', systemPrompt: '', userPrompt: 'user' });
  assert.equal(result.statusCode, 400);
  result = await invoke({}, 'GET');
  assert.equal(result.statusCode, 405);

  console.log('serverless api tests passed');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalKey;
}
