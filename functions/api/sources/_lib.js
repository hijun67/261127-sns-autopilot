// 소스 자동 수집 공용 라이브러리 (Cloudflare Pages Function · Node 테스트 공용)
// - 쿠팡파트너스 CEA(HMAC-SHA256) 서명 생성 · 상품 조회 · 제휴 딥링크 발급
// - 뉴스픽(m.newspic.kr) 핫기사 HTML 파싱 · 뉴스픽 파트너스 맞춤 RSS XML 파싱
// 키는 저장하지 않습니다(BYOK). 요청마다 받아 그 요청에서만 사용합니다.

export const COUPANG_HOST = 'https://api-gateway.coupang.com';
export const COUPANG_PRODUCTS_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/products';
export const COUPANG_DEEPLINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

/** 쿠팡 카테고리 베스트 19개 (쿠팡파트너스 공식 문서 기준) */
export const COUPANG_CATEGORIES = [
  { id: 1001, name: '여성패션' },
  { id: 1002, name: '남성패션' },
  { id: 1010, name: '뷰티' },
  { id: 1011, name: '출산/유아동' },
  { id: 1012, name: '식품' },
  { id: 1013, name: '주방용품' },
  { id: 1014, name: '생활용품' },
  { id: 1015, name: '홈인테리어' },
  { id: 1016, name: '가전디지털' },
  { id: 1017, name: '스포츠/레저' },
  { id: 1018, name: '자동차용품' },
  { id: 1019, name: '도서/음반/DVD' },
  { id: 1020, name: '완구/취미' },
  { id: 1021, name: '문구/오피스' },
  { id: 1024, name: '헬스/건강식품' },
  { id: 1025, name: '국내여행' },
  { id: 1026, name: '해외여행' },
  { id: 1029, name: '반려동물용품' },
  { id: 1030, name: '유아동패션' },
];

export const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

/* ------------------------------------------------------------------ */
/* 쿠팡 CEA 서명                                                        */
/* ------------------------------------------------------------------ */

/** UTC 기준 `YYMMDD'T'HHMMSS'Z'` */
export function coupangSignedDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${p(date.getUTCFullYear() % 100)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/** HMAC-SHA256 → 소문자 hex (Web Crypto, Cloudflare Workers/Node 모두 지원) */
export async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 쿠팡 Authorization 헤더.
 * message = signed-date + method + path + query (도메인 제외), 서명은 secretKey 로 HMAC-SHA256.
 */
export async function buildCoupangAuth({ method, path, query = '', accessKey, secretKey, signedDate }) {
  const date = signedDate || coupangSignedDate();
  const message = `${date}${String(method).toUpperCase()}${path}${query}`;
  const signature = await hmacHex(secretKey, message);
  return `CEA algorithm=HmacSHA256,access-key=${accessKey},signed-date=${date},signature=${signature}`;
}

async function coupangFetch({ method, path, query = '', accessKey, secretKey, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const auth = await buildCoupangAuth({ method, path, query, accessKey, secretKey });
    const res = await fetch(`${COUPANG_HOST}${path}${query ? `?${query}` : ''}`, {
      method,
      headers: {
        authorization: auth,
        'content-type': 'application/json;charset=UTF-8',
        accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
    if (!res.ok) {
      const err = new Error(
        res.status === 401
          ? '쿠팡 인증에 실패했습니다. Access Key·Secret Key를 확인해 주세요. (401)'
          : res.status === 429
            ? '쿠팡 API 호출 한도를 넘었습니다. 잠시 뒤 다시 시도해 주세요. (429)'
            : `쿠팡 API 오류 (HTTP ${res.status})`
      );
      err.status = res.status === 429 ? 429 : res.status === 401 ? 401 : 502;
      throw err;
    }
    if (data && data.rCode !== undefined && String(data.rCode) !== '0') {
      const err = new Error(String(data.rMessage || '쿠팡 API가 오류를 반환했습니다.').slice(0, 180));
      err.status = 502;
      throw err;
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeout = new Error('쿠팡 API 응답이 12초 안에 오지 않았습니다.');
      timeout.status = 504;
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 카테고리 베스트 상품 목록 */
export async function fetchCoupangBest({ categoryId, limit = 20, subId = '', accessKey, secretKey }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (subId) params.set('subId', subId);
  const query = params.toString();
  const path = `${COUPANG_PRODUCTS_PATH}/bestcategories/${categoryId}`;
  const data = await coupangFetch({ method: 'GET', path, query, accessKey, secretKey });
  return Array.isArray(data?.data) ? data.data : [];
}

/** 골드박스 상품 목록 (카테고리 조회가 비었을 때 폴백) */
export async function fetchCoupangGoldbox({ limit = 20, subId = '', accessKey, secretKey }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (subId) params.set('subId', subId);
  const data = await coupangFetch({
    method: 'GET',
    path: `${COUPANG_PRODUCTS_PATH}/goldbox`,
    query: params.toString(),
    accessKey,
    secretKey,
  });
  return Array.isArray(data?.data) ? data.data : [];
}

/** 상품 URL → 파트너스 추적 링크(딥링크) 발급 */
export async function fetchCoupangDeeplink({ urls = [], subId = '', accessKey, secretKey }) {
  const payload = { coupangUrls: urls };
  if (subId) payload.subId = subId;
  const data = await coupangFetch({
    method: 'POST',
    path: COUPANG_DEEPLINK_PATH,
    accessKey,
    secretKey,
    body: payload,
  });
  return Array.isArray(data?.data) ? data.data : [];
}

/** 쿠팡 응답 상품 → 앱 공통 형태 */
export function mapCoupangProduct(product = {}, category = {}) {
  return {
    productId: product.productId ?? null,
    title: String(product.productName || '').trim(),
    price: Number(product.productPrice) || 0,
    isRocket: Boolean(product.isRocket),
    isFreeShipping: Boolean(product.isFreeShipping),
    imageUrl: String(product.productImage || ''),
    originalUrl: String(product.productUrl || ''),
    landingUrl: String(product.productUrl || ''),
    category: category.name || '',
    categoryId: category.id ?? null,
  };
}

export function pickRandom(list = [], random = Math.random) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)));
  return list[idx];
}

/**
 * 카테고리 베스트에서 상품 1개 랜덤 선택 (카테고리 미지정이면 19개 중 랜덤)
 * 카테고리 목록이 비면 골드박스로 폴백합니다.
 */
export async function selectCoupangProduct({
  accessKey,
  secretKey,
  subId = '',
  categoryId = 0,
  limit = 20,
  random = Math.random,
} = {}) {
  let category;
  if (categoryId) {
    category = COUPANG_CATEGORIES.find((c) => c.id === Number(categoryId));
    if (!category) {
      const err = new Error(`지원하지 않는 카테고리 ID입니다: ${categoryId}`);
      err.status = 400;
      throw err;
    }
  } else {
    category = pickRandom(COUPANG_CATEGORIES, random);
  }

  const triedCategories = [category.name];
  let list = await fetchCoupangBest({ categoryId: category.id, limit, subId, accessKey, secretKey });
  let source = 'bestcategories';
  if (!list.length) {
    list = await fetchCoupangGoldbox({ limit, subId, accessKey, secretKey });
    source = 'goldbox';
  }
  if (!list.length) return null;
  const product = pickRandom(list, random);
  if (!product) return null;
  return { item: mapCoupangProduct(product, category), category, source, triedCategories };
}

/** 딥링크 발급 실패는 치명적이지 않으므로 원본 URL로 폴백할 수 있게 감쌉니다. */
export async function createCoupangDeeplinkSafe({ accessKey, secretKey, subId = '', url }) {
  try {
    const rows = await fetchCoupangDeeplink({ urls: [url], subId, accessKey, secretKey });
    const row = rows[0] || {};
    return {
      ok: true,
      landingUrl: row.landingUrl || row.shortenUrl || '',
      shortenUrl: row.shortenUrl || '',
      originalUrl: row.originalUrl || url,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || '딥링크 발급 실패').slice(0, 160) };
  }
}

/* ------------------------------------------------------------------ */
/* 뉴스픽 핫기사 HTML 파싱                                              */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
};

export function decodeEntities(text = '') {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function safeFromCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

export function stripTags(html = '') {
  return decodeEntities(
    String(html)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const firstGroup = (text, re) => {
  const m = String(text).match(re);
  return m ? m[1] : '';
};

/** m.newspic.kr 목록 HTML → 기사 배열 (제목·링크·이미지·요약) */
export function parseNewspicHtml(html = '', { base = 'https://m.newspic.kr', limit = 10 } = {}) {
  const out = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href="([^"]*\/view\.html\?nid=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(String(html))) !== null) {
    const href = decodeEntities(m[1]);
    const inner = m[2];
    const title =
      stripTags(firstGroup(inner, /<h1[^>]*>([\s\S]*?)<\/h1>/i)) ||
      stripTags(firstGroup(inner, /<p[^>]+class="[^"]*heading[^"]*"[^>]*>([\s\S]*?)<\/p>/i));
    if (!title) continue;
    const link = href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`;
    if (seen.has(link)) continue;
    seen.add(link);
    const rawImage =
      firstGroup(inner, /data-original="([^"]+)"/i) || firstGroup(inner, /<img[^>]+src="([^"]+)"/i);
    const image = /^https?:\/\//i.test(decodeEntities(rawImage)) ? decodeEntities(rawImage) : '';
    const summary =
      stripTags(firstGroup(inner, /<h2[^>]*>([\s\S]*?)<\/h2>/i)) ||
      stripTags(firstGroup(inner, /<p[^>]+class="[^"]*des[^"]*"[^>]*>([\s\S]*?)<\/p>/i));
    out.push({ title, link, image, summary, source: '뉴스픽', date: '' });
    if (out.length >= limit) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* RSS 파싱                                                             */
/* ------------------------------------------------------------------ */

/** 뉴스픽 파트너스 맞춤 RSS 등 외부 RSS XML → 기사 배열 */
export function parseRssXml(xml = '', { limit = 10 } = {}) {
  const text = String(xml);
  const blocks = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = itemRe.exec(text)) !== null) blocks.push(m[0]);
  if (!blocks.length) {
    while ((m = entryRe.exec(text)) !== null) blocks.push(m[0]);
  }
  const out = [];
  const seen = new Set();
  for (const block of blocks) {
    const title = stripTags(
      firstGroup(block, /<title[^>]*>([\s\S]*?)<\/title>/i) || ''
    );
    let link = firstGroup(block, /<link[^>]*>([\s\S]*?)<\/link>/i).trim();
    if (!link) link = firstGroup(block, /<link[^>]+href="([^"]+)"/i);
    link = decodeEntities(link).trim();
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);
    const description = stripTags(
      firstGroup(block, /<description[^>]*>([\s\S]*?)<\/description>/i) ||
        firstGroup(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
        firstGroup(block, /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)
    );
    const image = decodeEntities(
      firstGroup(block, /<media:content[^>]+url="([^"]+)"/i) ||
        firstGroup(block, /<media:thumbnail[^>]+url="([^"]+)"/i) ||
        firstGroup(block, /<enclosure[^>]+url="([^"]+)"/i) ||
        firstGroup(block, /<img[^>]+src="([^"]+)"/i)
    );
    const date = stripTags(firstGroup(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || '');
    out.push({
      title,
      link,
      image: /^https?:\/\//i.test(image) ? image : '',
      summary: description.slice(0, 200),
      source: '뉴스픽 파트너스 RSS',
      date,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 사용자가 입력한 RSS URL 검증 — 서버가 임의 URL을 대신 호출하는 SSRF를 막기 위해
 * http(s) + *.newspic.kr 만 허용합니다.
 */
export function safeRssUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const allowed =
    host === 'newspic.kr' ||
    host.endsWith('.newspic.kr') ||
    host === 'newspic.co.kr' ||
    host.endsWith('.newspic.co.kr');
  if (!allowed) return null;
  if (/^(localhost|\[|0\.0\.0\.0$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    return null;
  }
  return url.toString();
}

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'accept-language': 'ko-KR,ko;q=0.9',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchText(url, { timeout = 9000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: controller.signal });
    const body = await res.text();
    return { status: res.status, url: res.url, body };
  } finally {
    clearTimeout(timer);
  }
}

/** 뉴스픽 홈/카테고리에서 핫기사 목록 수집 */
export async function fetchNewspicHot({ limit = 8, category = 'hot' } = {}) {
  const targets = [
    category && category !== 'hot' ? `https://m.newspic.kr/main?category=${encodeURIComponent(category)}` : '',
    'https://m.newspic.kr/',
    'https://www.newspic.kr/',
  ].filter(Boolean);
  const warnings = [];
  for (const target of targets) {
    try {
      const res = await fetchText(target);
      if (res.status !== 200) {
        warnings.push(`${target} 응답 HTTP ${res.status}`);
        continue;
      }
      const articles = parseNewspicHtml(res.body, { base: 'https://m.newspic.kr', limit });
      if (articles.length) return { articles, source: res.url || target, warnings };
      warnings.push(`${target} 에서 기사 목록을 찾지 못했습니다.`);
    } catch (err) {
      warnings.push(`${target} 호출 실패: ${err?.name === 'AbortError' ? '시간 초과' : '연결 오류'}`);
    }
  }
  return { articles: [], source: '', warnings };
}

/** 뉴스픽 파트너스 RSS 수집 */
export async function fetchNewspicRss(rssUrl, { limit = 8 } = {}) {
  const safe = safeRssUrl(rssUrl);
  if (!safe) {
    const err = new Error('RSS URL은 http(s)://*.newspic.kr 주소만 사용할 수 있습니다.');
    err.status = 400;
    throw err;
  }
  const res = await fetchText(safe);
  if (res.status !== 200) {
    const err = new Error(`RSS 응답이 HTTP ${res.status} 입니다.`);
    err.status = 502;
    throw err;
  }
  if (!/<(rss|feed|rdf:RDF)\b/i.test(res.body)) {
    const err = new Error('응답이 RSS/Atom XML이 아닙니다. 파트너스 맞춤 RSS 주소를 다시 확인해 주세요.');
    err.status = 502;
    throw err;
  }
  const items = parseRssXml(res.body, { limit });
  if (!items.length) {
    const err = new Error('RSS는 읽었지만 기사 항목이 없습니다.');
    err.status = 502;
    throw err;
  }
  return items;
}
