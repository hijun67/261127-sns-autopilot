// 소스 자동 수집 · 제휴 URL 풀 — 브라우저 UI와 Node 테스트가 함께 쓰는 순수 함수 + API 호출 래퍼

export const POOL_KINDS = [
  { id: 'brandconnect', name: '네이버 브랜드커넥트' },
  { id: 'toss', name: '토스 쉐어링크' },
  { id: 'coupang', name: '쿠팡파트너스' },
  { id: 'etc', name: '기타 제휴' },
];

export const EMPTY_COUPANG = { accessKey: '', secretKey: '', subId: '' };
export const EMPTY_TOSS = { accessKey: '', secretKey: '', publisherId: '' };

/** 키 마스킹 — 앞 4자리만 남기고 가운데를 가립니다(빈 값은 빈 문자열) */
export function maskSecret(value, { keep = 4 } = {}) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= keep * 2) return '•'.repeat(Math.max(4, text.length));
  return `${text.slice(0, keep)}${'•'.repeat(Math.min(12, Math.max(4, text.length - keep * 2)))}${text.slice(-4)}`;
}

export function formatPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${n.toLocaleString('ko-KR')}원`;
}

export function hasCoupangKeys(settings = {}) {
  const creds = settings.coupang || {};
  return Boolean(String(creds.accessKey || '').trim() && String(creds.secretKey || '').trim());
}

export function hasTossKeys(settings = {}) {
  const creds = settings.toss || {};
  return Boolean(String(creds.accessKey || '').trim() && String(creds.secretKey || '').trim());
}

function normalizeUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

/** 제휴 URL 풀 항목 정규화 — URL이 http(s)가 아니면 null */
export function normalizePoolEntry({ name = '', url = '', kind = 'etc' } = {}, id) {
  const safeUrl = normalizeUrl(url);
  if (!safeUrl) return null;
  const safeKind = POOL_KINDS.some((k) => k.id === kind) ? kind : 'etc';
  return {
    id: String(id || `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
    name: String(name || '').trim().slice(0, 80) || safeKindName(safeKind),
    url: safeUrl,
    kind: safeKind,
  };
}

export function safeKindName(kind) {
  return POOL_KINDS.find((k) => k.id === kind)?.name || '기타 제휴';
}

/** 소스에 맞는 풀 목록 — 해당 종류가 없으면 '기타', 그것도 없으면 전체 */
export function poolForSource(pool = [], sourceId = '') {
  const list = Array.isArray(pool) ? pool.filter((p) => p && p.url) : [];
  if (!sourceId || !POOL_KINDS.some((k) => k.id === sourceId)) return list;
  const exact = list.filter((p) => p.kind === sourceId);
  if (exact.length) return exact;
  const etc = list.filter((p) => p.kind === 'etc');
  if (etc.length) return etc;
  return list;
}

/** 🎲 랜덤 뽑기 — random()을 주입하면 테스트에서 결정적으로 동작 */
export function pickFromPool(pool = [], { sourceId = '', random = Math.random } = {}) {
  const list = poolForSource(pool, sourceId);
  if (!list.length) return null;
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)));
  return list[idx];
}

/* ------------------------------------------------------------------ */
/* Cloudflare Functions 호출                                           */
/* ------------------------------------------------------------------ */

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `요청 실패 (HTTP ${response.status})`);
  }
  return data;
}

/** 쿠팡파트너스 상품 1개 + 제휴 딥링크 */
export async function requestCoupangProduct({ creds = {}, categoryId = 0, limit = 20 } = {}) {
  const res = await fetch('/api/sources/coupang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessKey: creds.accessKey || '',
      secretKey: creds.secretKey || '',
      subId: creds.subId || '',
      categoryId: Number(categoryId) || 0,
      limit: Number(limit) || 20,
    }),
  });
  return readJson(res);
}

/** 뉴스픽 핫기사 + 맞춤 RSS */
export async function requestNewspicArticles({ rss = '', limit = 8, category = 'hot' } = {}) {
  const params = new URLSearchParams({ limit: String(limit), category });
  if (rss) params.set('rss', rss);
  const res = await fetch(`/api/sources/newspic?${params.toString()}`);
  return readJson(res);
}
