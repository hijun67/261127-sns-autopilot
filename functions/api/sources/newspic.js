// Cloudflare Pages Function — /api/sources/newspic
// 뉴스픽 앱·웹 홈의 핫기사와, 사용자가 설정에 넣은 뉴스픽 파트너스 맞춤 RSS를 함께 돌려줍니다.
// GET /api/sources/newspic?limit=8&category=hot&rss=https%3A%2F%2Fpartners.newspic.kr%2F...xml

import { clampNumber, fetchNewspicHot, fetchNewspicRss, safeRssUrl } from './_lib.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get('limit'), 1, 20, 8);
  const category = String(url.searchParams.get('category') || 'hot').slice(0, 12);
  const rssParam = String(url.searchParams.get('rss') || '').slice(0, 600);

  const warnings = [];
  let hot = [];
  let hotSource = '';
  let rss = [];
  let rssError = null;

  try {
    const result = await fetchNewspicHot({ limit, category });
    hot = result.articles;
    hotSource = result.source;
    warnings.push(...result.warnings);
  } catch (err) {
    warnings.push(`뉴스픽 핫기사 수집 실패: ${String(err?.message || err).slice(0, 120)}`);
  }

  if (rssParam) {
    if (!safeRssUrl(rssParam)) {
      rssError = 'RSS URL은 http(s)://*.newspic.kr 주소만 사용할 수 있습니다.';
    } else {
      try {
        rss = await fetchNewspicRss(rssParam, { limit });
      } catch (err) {
        rssError = String(err?.message || 'RSS를 읽지 못했습니다.').slice(0, 160);
      }
    }
  }

  // 핫기사 먼저, 그 뒤 사용자 RSS — 같은 링크는 한 번만
  const seen = new Set();
  const articles = [];
  for (const article of [...hot, ...rss]) {
    if (!article?.link || seen.has(article.link)) continue;
    seen.add(article.link);
    articles.push({ ...article, from: hot.includes(article) ? 'hot' : 'rss' });
  }

  const ok = hot.length > 0 || rss.length > 0;
  return json(
    {
      ok,
      articles,
      hot,
      rss,
      hotSource,
      rssConfigured: Boolean(rssParam),
      rssError,
      warnings,
      fetchedAt: new Date().toISOString(),
      note: ok
        ? '핫기사 목록과 맞춤 RSS를 합쳐 돌려줍니다.'
        : '뉴스픽에서 기사 목록을 가져오지 못했습니다. RSS URL을 설정하면 그 경로로 계속 사용할 수 있습니다.',
    },
    ok ? 200 : 502
  );
}
