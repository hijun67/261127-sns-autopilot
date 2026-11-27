// Cloudflare Pages Function — /api/generate
// BYOK(Bring Your Own Key): 키는 서버에 저장하지 않고 요청마다 받아 그 요청에서만 사용합니다.

const MODELS = {
  gemini: { model: 'gemini-2.5-flash', url: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}` },
  openrouter: { model: 'google/gemini-2.0-flash-exp:free', url: () => 'https://openrouter.ai/api/v1/chat/completions' },
  groq: { model: 'llama-3.3-70b-versatile', url: () => 'https://api.groq.com/openai/v1/chat/completions' },
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function extractText(provider, data) {
  if (provider === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text || '').join('');
  }
  return data?.choices?.[0]?.message?.content || '';
}

async function callProvider(provider, apiKey, prompt, maxTokens = 2048) {
  const cfg = MODELS[provider];
  const headers = { 'content-type': 'application/json' };
  let body;

  if (provider === 'gemini') {
    body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
    };
  } else if (provider === 'openrouter') {
    headers.authorization = `Bearer ${apiKey}`;
    headers['http-referer'] = 'https://sns-autopilot-bin.pages.dev';
    headers['x-title'] = 'SNS Autopilot';
    body = {
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      max_tokens: maxTokens,
    };
  } else {
    headers.authorization = `Bearer ${apiKey}`;
    body = {
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(cfg.url(apiKey), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const raw = data?.error?.message || data?.message || `HTTP ${res.status}`;
      return { ok: false, status: res.status === 429 ? 429 : 502, error: cleanError(raw) };
    }
    const text = extractText(provider, data);
    if (!text) return { ok: false, status: 502, error: 'AI가 빈 응답을 보냈습니다.' };
    return { ok: true, text, model: cfg.model };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return { ok: false, status: aborted ? 504 : 502, error: aborted ? 'AI 응답 시간이 초과되었습니다.' : 'AI 서비스에 연결하지 못했습니다.' };
  } finally {
    clearTimeout(timer);
  }
}

function cleanError(message) {
  const text = String(message || '알 수 없는 오류');
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export async function onRequestGet() {
  return json({
    ok: true,
    service: 'sns-autopilot',
    providers: Object.keys(MODELS),
    note: '키를 저장하지 않는 BYOK 프록시입니다. POST {provider, apiKey, prompt}로 호출하세요.',
  });
}

export async function onRequestPost({ request }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'JSON 본문이 필요합니다.' }, 400);
  }

  const provider = String(payload?.provider || '');
  const apiKey = String(payload?.apiKey || '').trim();
  const prompt = String(payload?.prompt || '');

  if (!MODELS[provider]) {
    return json({ ok: false, error: '지원하지 않는 AI 제공자입니다. (gemini | openrouter | groq)' }, 400);
  }
  if (!apiKey || apiKey.length < 8 || apiKey.length > 400) {
    return json({ ok: false, error: 'API 키가 없거나 형식이 올바르지 않습니다.' }, 400);
  }
  if (!prompt.trim() || prompt.length > 12000) {
    return json({ ok: false, error: '프롬프트가 비었거나 너무 깁니다(최대 12,000자).' }, 400);
  }

  const result = await callProvider(provider, apiKey, prompt);
  if (!result.ok) {
    return json({ ok: false, provider, error: result.error }, result.status);
  }
  return json({ ok: true, provider, model: result.model, text: result.text });
}
