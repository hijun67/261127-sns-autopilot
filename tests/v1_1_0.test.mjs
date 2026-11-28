// v1.1.0 — 소스 자동 수집 · 제휴링크 · 뉴스픽 파트너스 본문/연결 댓글 분리 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

import { APP, SOURCES, COUPANG_CATEGORIES, getSource, defaultState } from '../public/js/data.js';
import { generateContent, makeQueueItem } from '../public/js/generator.js';
import { buildPartnerCopy, clampBodyLines, stripLinks } from '../public/js/partner.js';
import {
  POOL_KINDS,
  maskSecret,
  formatPrice,
  normalizePoolEntry,
  pickFromPool,
  poolForSource,
  hasCoupangKeys,
  hasTossKeys,
} from '../public/js/sourcehub.js';
import { mergeState } from '../public/js/store.js';
import {
  COUPANG_CATEGORIES as SERVER_CATEGORIES,
  COUPANG_DEEPLINK_PATH,
  buildCoupangAuth,
  coupangSignedDate,
  mapCoupangProduct,
  parseNewspicHtml,
  parseRssXml,
  pickRandom,
  safeRssUrl,
  selectCoupangProduct,
} from '../functions/api/sources/_lib.js';

/* ---------------- 버전 · 카탈로그 ---------------- */

test('버전은 1.1.0이고 package.json과 일치한다', () => {
  assert.equal(APP.version, '1.1.0');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, '1.1.0');
});

test('소스마다 자동 수집 방식(auto)이 지정돼 있다', () => {
  for (const src of SOURCES) assert.ok(src.auto, `${src.name} auto 없음`);
  assert.equal(getSource('coupang').auto, 'coupang');
  assert.equal(getSource('newspic-partners').auto, 'newspic');
  assert.equal(getSource('newspic-partners').partnerFormat, true);
  assert.equal(getSource('brandconnect').auto, 'pool');
  assert.equal(getSource('toss').auto, 'pool');
  assert.equal(getSource('self').auto, 'none');
});

test('쿠팡 카테고리 19개가 클라이언트와 서버에서 같다', () => {
  assert.equal(COUPANG_CATEGORIES.length, 19);
  assert.deepEqual(COUPANG_CATEGORIES, SERVER_CATEGORIES);
});

/* ---------------- 쿠팡 CEA 서명 ---------------- */

test('쿠팡 signed-date는 UTC YYMMDDTHHMMSSZ 형식', () => {
  assert.equal(coupangSignedDate(new Date('2026-11-28T00:00:05Z')), '261128T000005Z');
  assert.equal(coupangSignedDate(new Date('2027-01-02T23:59:59Z')), '270102T235959Z');
});

test('쿠팡 HMAC-SHA256 서명이 규격(message = date+method+path+query)과 일치한다', async () => {
  const date = '261128T091500Z';
  const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1016';
  const query = 'limit=20&subId=sns';
  const expected = crypto
    .createHmac('sha256', 'secret-key')
    .update(`${date}GET${path}${query}`)
    .digest('hex');
  const auth = await buildCoupangAuth({
    method: 'GET',
    path,
    query,
    accessKey: 'access-key',
    secretKey: 'secret-key',
    signedDate: date,
  });
  assert.equal(
    auth,
    `CEA algorithm=HmacSHA256,access-key=access-key,signed-date=${date},signature=${expected}`
  );
  assert.match(auth, /^CEA algorithm=HmacSHA256,access-key=.+,signed-date=\d{6}T\d{6}Z,signature=[0-9a-f]{64}$/);
});

test('쿠팡 POST(딥링크) 서명도 메서드가 서명 대상에 들어간다', async () => {
  const date = '261128T091500Z';
  const post = await buildCoupangAuth({
    method: 'POST',
    path: COUPANG_DEEPLINK_PATH,
    accessKey: 'a',
    secretKey: 's',
    signedDate: date,
  });
  const get = await buildCoupangAuth({
    method: 'GET',
    path: COUPANG_DEEPLINK_PATH,
    accessKey: 'a',
    secretKey: 's',
    signedDate: date,
  });
  assert.notEqual(post, get);
});

test('쿠팡 상품 응답 → 앱 공통 형태 매핑', () => {
  const item = mapCoupangProduct(
    {
      productId: 123,
      productName: ' 무선 청소기 ',
      productPrice: 129000,
      productImage: 'https://image/1.jpg',
      productUrl: 'https://www.coupang.com/vp/products/123',
      isRocket: true,
      isFreeShipping: false,
    },
    { id: 1016, name: '가전디지털' }
  );
  assert.deepEqual(item, {
    productId: 123,
    title: '무선 청소기',
    price: 129000,
    isRocket: true,
    isFreeShipping: false,
    imageUrl: 'https://image/1.jpg',
    originalUrl: 'https://www.coupang.com/vp/products/123',
    landingUrl: 'https://www.coupang.com/vp/products/123',
    category: '가전디지털',
    categoryId: 1016,
  });
});

test('알 수 없는 카테고리는 네트워크 호출 전에 400으로 거부한다', async () => {
  await assert.rejects(
    () => selectCoupangProduct({ accessKey: 'a', secretKey: 'b', categoryId: 9999 }),
    (err) => err.status === 400 && /카테고리/.test(err.message)
  );
});

test('pickRandom은 주입한 random으로 결정적으로 뽑는다', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(pickRandom(list, () => 0), 'a');
  assert.equal(pickRandom(list, () => 0.5), 'b');
  assert.equal(pickRandom(list, () => 0.999), 'c');
  assert.equal(pickRandom([], () => 0.5), null);
});

/* ---------------- 뉴스픽 파싱 ---------------- */

const NEWSPIC_HTML = `
<div class="wrap-slide">
  <a class="link_slide" href="/view.html?nid=2026112714581749221&amp;pn=82">
    <div class="pic"><img class="lazy" src="https://images-cdn.newspic.kr/thumb1/a.jpg" alt="남경주"></div>
    <div class="info"><p class="heading text_overflow2">남경주, 제자와 성관계 시도 인정했지만…“무죄 주장”</p></div>
  </a>
</div>
<section class="textList mixList"><ul>
  <li><a href="/view.html?nid=2026112716594690607&amp;pn=82">
    <div><img class="lazy" src="data:image/gif;base64,R0lGOD" data-original="https://rimages-cdn.newspic.kr/thumb1/b.jpg?w=240&amp;h=120&amp;area=MAIN"></div>
    <h1>‘188cm’ 강호동 아들 강시후, 전국 골프대회 준우승</h1>
    <h2>스포츠동아 11.27</h2>
  </a></li>
  <li><a href="/view.html?nid=2026112720313423276&amp;pn=82">
    <div><img class="lazy" src="data:image/gif;base64,R0lGOD" data-original="https://rimages-cdn.newspic.kr/thumb1/c.jpg"></div>
    <h1>임찬규♥손새은, 5년 열애 끝…손나은과 진짜 가족 된다</h1>
    <h2>스포츠동아 11.27</h2>
  </a></li>
  <li><a href="/view.html?nid=2026112716594690607&amp;pn=82">
    <h1>중복 기사</h1>
  </a></li>
</ul></section>`;

test('뉴스픽 홈 HTML에서 기사 목록을 파싱한다(제목·절대링크·이미지·요약)', () => {
  const articles = parseNewspicHtml(NEWSPIC_HTML, { limit: 10 });
  assert.equal(articles.length, 3, '중복 링크는 한 번만');
  assert.equal(articles[0].title, '남경주, 제자와 성관계 시도 인정했지만…“무죄 주장”');
  assert.equal(articles[0].link, 'https://m.newspic.kr/view.html?nid=2026112714581749221&pn=82');
  assert.equal(articles[0].image, 'https://images-cdn.newspic.kr/thumb1/a.jpg');
  assert.equal(articles[1].title, '‘188cm’ 강호동 아들 강시후, 전국 골프대회 준우승');
  assert.equal(articles[1].image, 'https://rimages-cdn.newspic.kr/thumb1/b.jpg?w=240&h=120&area=MAIN');
  assert.equal(articles[1].summary, '스포츠동아 11.27');
  assert.equal(articles[2].title, '임찬규♥손새은, 5년 열애 끝…손나은과 진짜 가족 된다');
});

test('limit 만큼만 돌려주고, 기사가 없으면 빈 배열', () => {
  assert.equal(parseNewspicHtml(NEWSPIC_HTML, { limit: 1 }).length, 1);
  assert.deepEqual(parseNewspicHtml('<html><body>no articles</body></html>'), []);
});

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>뉴스픽 파트너스</title>
<item>
  <title><![CDATA[‘188cm’ 강호동 아들 강시후, 전국 골프대회 준우승]]></title>
  <link>https://newspic.kr/view.html?nid=1&amp;pn=82&amp;utm_source=partner</link>
  <description><![CDATA[<p>스포츠동아 11.27 &amp; 요약</p>]]></description>
  <media:content url="https://images-cdn.newspic.kr/1.jpg" />
  <pubDate>Fri, 27 Nov 2026 10:00:00 +0900</pubDate>
</item>
<item>
  <title>두 번째 기사</title>
  <link>https://newspic.kr/view.html?nid=2</link>
  <enclosure url="https://images-cdn.newspic.kr/2.jpg" type="image/jpeg" />
</item>
<item>
  <title>중복</title>
  <link>https://newspic.kr/view.html?nid=2</link>
</item>
</channel></rss>`;

test('뉴스픽 파트너스 RSS XML을 파싱한다(CDATA·엔티티·이미지·중복 제거)', () => {
  const list = parseRssXml(RSS_XML, { limit: 10 });
  assert.equal(list.length, 2);
  assert.equal(list[0].title, '‘188cm’ 강호동 아들 강시후, 전국 골프대회 준우승');
  assert.equal(list[0].link, 'https://newspic.kr/view.html?nid=1&pn=82&utm_source=partner');
  assert.equal(list[0].image, 'https://images-cdn.newspic.kr/1.jpg');
  assert.match(list[0].summary, /스포츠동아 11.27 & 요약/);
  assert.equal(list[0].date, 'Fri, 27 Nov 2026 10:00:00 +0900');
  assert.equal(list[1].title, '두 번째 기사');
  assert.equal(list[1].image, 'https://images-cdn.newspic.kr/2.jpg');
});

test('RSS URL은 *.newspic.kr http(s)만 허용한다(SSRF 방지)', () => {
  assert.ok(safeRssUrl('https://partners.newspic.kr/rss/abc.xml'));
  assert.ok(safeRssUrl('https://m.newspic.kr/rss.xml'));
  assert.equal(safeRssUrl('https://evil.example.com/rss.xml'), null);
  assert.equal(safeRssUrl('http://127.0.0.1:8080/rss.xml'), null);
  assert.equal(safeRssUrl('file:///etc/passwd'), null);
  assert.equal(safeRssUrl('http://10.0.0.5/rss'), null);
  assert.equal(safeRssUrl('newspic.kr/rss'), null);
  assert.equal(safeRssUrl(''), null);
});

/* ---------------- 뉴스픽 파트너스 포맷 ---------------- */

test('파트너스 본문은 후킹 2~3줄이고 링크가 없다', () => {
  const copy = buildPartnerCopy({ topic: '강호동 아들 골프 준우승', link: 'https://link.partner/abc', seed: 0 });
  const lines = copy.body.split('\n');
  assert.ok(lines.length >= 2 && lines.length <= 3, `본문 ${lines.length}줄`);
  assert.equal(copy.body.includes('http'), false);
  assert.equal(copy.body.includes('link.partner'), false);
  assert.equal(copy.isPartner, true);
  assert.equal(copy.missingLink, false);
  assert.match(copy.comment, /https:\/\/link\.partner\/abc/);
  assert.match(copy.comment, /댓글|의견|생각/);
});

test('파트너스 연결 댓글에 제휴 링크와 댓글 유도가 함께 들어간다', () => {
  for (let seed = 0; seed < 6; seed += 1) {
    const copy = buildPartnerCopy({ topic: '주제', link: `https://link/${seed}`, seed });
    assert.match(copy.comment, new RegExp(`https://link/${seed}`));
    assert.ok(copy.comment.length > 20);
    assert.ok(copy.body.split('\n').length <= 3);
  }
});

test('링크가 비면 missingLink로 표시하고, 대가성 문구는 댓글에 붙는다', () => {
  const copy = buildPartnerCopy({ topic: '주제', link: '', disclosure: '이 콘텐츠는 파트너스 활동의 일환입니다.' });
  assert.equal(copy.missingLink, true);
  assert.match(copy.comment, /파트너스 활동/);
});

test('stripLinks · clampBodyLines가 AI 본문에서 링크와 여분 줄을 정리한다', () => {
  assert.equal(stripLinks('a https://x.com b'), 'a  b'.replace('  ', ' '));
  const body = clampBodyLines('한 줄 https://x.com\n두 줄\n세 줄\n네 줄', { min: 2, max: 3 });
  assert.equal(body.split('\n').length, 3);
  assert.equal(body.includes('http'), false);
});

test('뉴스픽 파트너스 소스는 생성 결과에 본문·연결 댓글을 분리해 담는다', () => {
  const content = generateContent({
    topic: '강호동 아들 골프 준우승',
    sourceId: 'newspic-partners',
    goalId: 'newspic',
    channelId: 'threads',
    formatId: 'sns',
    link: 'https://newspic.kr/view.html?nid=1&utm_source=partner',
  });
  assert.ok(content.partner, 'partner 블록이 있어야 한다');
  assert.equal(content.meta.partnerFormat, true);
  assert.equal(content.meta.comment, content.partner.comment);
  assert.equal(content.body === undefined, true);
  assert.equal(content.sns.threads, content.partner.body, 'SNS 본문은 링크 없는 후킹 본문');
  assert.equal(content.sns.threads.includes('http'), false);
  assert.match(content.sns.partnerComment, /newspic\.kr\/view\.html/);
  assert.equal(content.sns.partnerBody, content.partner.body);
});

test('다른 소스는 partner 블록이 없고 기존 SNS 문구를 유지한다', () => {
  const content = generateContent({
    topic: '연말정산',
    sourceId: 'coupang',
    goalId: 'affiliate',
    channelId: 'threads',
    formatId: 'sns',
    link: 'https://link.coupang.com/a/1',
  });
  assert.equal(content.partner, null);
  assert.equal(content.meta.partnerFormat, false);
  assert.equal(content.sns.partnerComment, undefined);
});

test('큐 항목에 연결 댓글과 본문이 함께 저장된다', () => {
  const content = generateContent({
    topic: '주제',
    sourceId: 'newspic-partners',
    goalId: 'newspic',
    channelId: 'threads',
    formatId: 'sns',
    link: 'https://newspic.kr/view.html?nid=9',
  });
  const item = makeQueueItem(content, { scheduledAt: '2026-11-28T09:00:00' });
  assert.equal(item.comment, content.partner.comment);
  assert.equal(item.partnerBody, content.partner.body);
  assert.match(item.comment, /newspic\.kr/);
});

/* ---------------- URL 풀 ---------------- */

test('제휴 URL 풀: 정상 URL만 등록되고 이름·종류가 정리된다', () => {
  const ok = normalizePoolEntry({ name: ' 제주 항공권 ', url: 'https://brandconnect.naver.com/x', kind: 'brandconnect' }, 'p1');
  assert.deepEqual(ok, { id: 'p1', name: '제주 항공권', url: 'https://brandconnect.naver.com/x', kind: 'brandconnect' });
  assert.equal(normalizePoolEntry({ name: 'x', url: 'javascript:alert(1)' }), null);
  assert.equal(normalizePoolEntry({ name: 'x', url: 'not a url' }), null);
  const fallback = normalizePoolEntry({ name: '', url: 'https://toss.im/y', kind: 'weird' });
  assert.equal(fallback.kind, 'etc');
  assert.equal(fallback.name, '기타 제휴');
});

test('풀은 소스 종류로 거르고, 없으면 기타 → 전체 순으로 폴백한다', () => {
  const pool = [
    { id: 'a', name: 'A', url: 'https://a.example/1', kind: 'brandconnect' },
    { id: 'b', name: 'B', url: 'https://b.example/2', kind: 'toss' },
    { id: 'c', name: 'C', url: 'https://c.example/3', kind: 'etc' },
  ];
  assert.deepEqual(poolForSource(pool, 'toss').map((p) => p.id), ['b']);
  assert.deepEqual(poolForSource(pool, 'brandconnect').map((p) => p.id), ['a']);
  assert.deepEqual(poolForSource(pool, 'coupang').map((p) => p.id), ['c']);
  assert.equal(poolForSource([], 'toss').length, 0);
});

test('🎲 랜덤 뽑기는 주입한 random으로 하나를 고른다', () => {
  const pool = [
    { id: 'a', name: 'A', url: 'https://a.example/1', kind: 'toss' },
    { id: 'b', name: 'B', url: 'https://b.example/2', kind: 'toss' },
  ];
  assert.equal(pickFromPool(pool, { sourceId: 'toss', random: () => 0 }).id, 'a');
  assert.equal(pickFromPool(pool, { sourceId: 'toss', random: () => 0.99 }).id, 'b');
  assert.equal(pickFromPool([], { sourceId: 'toss' }), null);
  assert.ok(POOL_KINDS.some((k) => k.id === 'brandconnect'));
});

/* ---------------- 마스킹 · 표시 ---------------- */

test('키 마스킹: 가운데를 가리고 앞 4자리만 남긴다', () => {
  const masked = maskSecret('AKIA1234567890ABCD');
  assert.match(masked, /^AKIA/);
  assert.match(masked, /ABCD$/);
  assert.ok(!masked.includes('1234567890'));
  assert.equal(maskSecret(''), '');
  assert.ok(maskSecret('short').length >= 4);
  assert.equal(hasCoupangKeys({ coupang: { accessKey: 'a', secretKey: '' } }), false);
  assert.equal(hasCoupangKeys({ coupang: { accessKey: 'a', secretKey: 'b' } }), true);
  assert.equal(hasTossKeys({ toss: { accessKey: 'a', secretKey: 'b' } }), true);
});

test('가격 표기는 천 단위 + 원', () => {
  assert.equal(formatPrice(129000), '129,000원');
  assert.equal(formatPrice('9900'), '9,900원');
  assert.equal(formatPrice(0), '');
  assert.equal(formatPrice('abc'), '');
});

/* ---------------- 상태 저장 ---------------- */

test('설정 저장: 쿠팡·토스 키·RSS·URL 풀이 보존되고 잘못된 값은 걸러진다', () => {
  const merged = mergeState({
    settings: {
      coupang: { accessKey: ' AK ', secretKey: ' SK ', subId: 'sub' },
      toss: { accessKey: 'TA', secretKey: 'TS', publisherId: 'pub' },
      newspicRss: ' https://partners.newspic.kr/rss/1.xml ',
      affiliatePool: [
        { id: 'p1', name: '상품', url: 'https://brandconnect.naver.com/x', kind: 'brandconnect' },
        { id: 'p2', name: '깨진', url: 'javascript:1', kind: 'etc' },
      ],
    },
  });
  assert.deepEqual(merged.settings.coupang, { accessKey: 'AK', secretKey: 'SK', subId: 'sub' });
  assert.deepEqual(merged.settings.toss, { accessKey: 'TA', secretKey: 'TS', publisherId: 'pub' });
  assert.equal(merged.settings.newspicRss, 'https://partners.newspic.kr/rss/1.xml');
  assert.equal(merged.settings.affiliatePool.length, 1);
  assert.equal(merged.settings.affiliatePool[0].name, '상품');
});

test('기본 상태에는 소스 API 설정이 빈 값으로 들어 있다', () => {
  const s = defaultState();
  assert.deepEqual(s.settings.coupang, { accessKey: '', secretKey: '', subId: '' });
  assert.deepEqual(s.settings.toss, { accessKey: '', secretKey: '', publisherId: '' });
  assert.equal(s.settings.newspicRss, '');
  assert.deepEqual(s.settings.affiliatePool, []);
});
