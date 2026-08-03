const MAX_REQUEST_CHARS = 60000;
const DEFAULT_MAX_TOKENS = 2600;
const MAX_TOKENS = 3200;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
// A normal story day can use 6–7 guarded AI calls.  Keep abuse protection while
// allowing an evaluator to complete several daily flows in one sitting.
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestBuckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function allowRequest(clientIp) {
  const now = Date.now();
  const current = requestBuckets.get(clientIp);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestBuckets.set(clientIp, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function readBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: '仅支持 POST 请求' });

  let body;
  try {
    body = readBody(req);
  } catch (_) {
    return json(res, 400, { error: '请求格式无效' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (body.action === 'health') {
    return json(res, apiKey ? 200 : 503, { configured: Boolean(apiKey) });
  }
  if (!apiKey) return json(res, 503, { error: 'AI 服务尚未配置' });
  if (body.action !== 'chat') return json(res, 400, { error: '不支持的 AI 请求' });

  const systemPrompt = String(body.systemPrompt || '');
  const userPrompt = String(body.userPrompt || '');
  if (!systemPrompt || !userPrompt || systemPrompt.length + userPrompt.length > MAX_REQUEST_CHARS) {
    return json(res, 400, { error: '提示词内容无效或过长' });
  }
  if (!allowRequest(getClientIp(req))) {
    return json(res, 429, { error: '请求过于频繁，请稍后再试' });
  }

  const requestedMaxTokens = Number(body.maxTokens);
  const maxTokens = Number.isFinite(requestedMaxTokens)
    ? Math.max(100, Math.min(MAX_TOKENS, Math.floor(requestedMaxTokens)))
    : DEFAULT_MAX_TOKENS;
  const temperature = Number.isFinite(Number(body.temperature))
    ? Math.max(0, Math.min(2, Number(body.temperature)))
    : 0.8;
  const jsonMode = body.jsonMode === true;

  try {
    const upstream = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json(res, upstream.status, { error: data?.error?.message || 'AI 服务暂时不可用' });
    }
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return json(res, 502, { error: 'AI 返回内容为空' });
    return json(res, 200, { content, tokensUsed: data?.usage?.total_tokens });
  } catch (_) {
    return json(res, 502, { error: 'AI 服务连接失败，请稍后重试' });
  }
}
