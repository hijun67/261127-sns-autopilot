import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHANNELS,
  FORMATS,
  GOALS,
  SOURCES,
  FREQUENCIES,
  defaultState,
  getChannel,
  getFormat,
} from '../public/js/data.js';
import {
  scheduleTimes,
  buildTimeline,
  nextSlot,
  toMinutes,
  validateRequest,
  generateContent,
  buildMultiChannelPack,
  makeQueueItem,
  transitionQueue,
  canTransition,
  summarizeQueue,
  fillDayQueue,
  buildLink,
  escapeHtml,
  charCount,
  truncateChars,
  dateKey,
  addDays,
  queueForDate,
} from '../public/js/generator.js';
import { mergeState, exportJSON, importJSON, normalizeMix, loadState, saveState } from '../public/js/store.js';

/* ---------------- 카탈로그 ---------------- */

test('카탈로그: 채널 9개 · 포맷 4종 · 수익 목표 9종 · 소스 7종', () => {
  assert.equal(CHANNELS.length, 9);
  assert.equal(FORMATS.length, 4);
  assert.equal(GOALS.length, 9);
  assert.ok(SOURCES.length >= 6);
  for (const ch of CHANNELS) {
    assert.ok(ch.formats.length >= 1, `${ch.name} 포맷 없음`);
    for (const f of ch.formats) assert.ok(getFormat(f), `${ch.name}: 알 수 없는 포맷 ${f}`);
  }
});

test('네이버·티스토리는 API 미지원 + 원클릭 복사 배지를 가진다', () => {
  for (const id of ['naver', 'tistory']) {
    const ch = getChannel(id);
    assert.equal(ch.apiSupported, false);
    assert.match(ch.badge, /복사/);
  }
});

test('제휴 소스는 대가성 문구 대상으로 표시된다', () => {
  for (const id of ['coupang', 'brandconnect', 'toss']) {
    const src = SOURCES.find((s) => s.id === id);
    assert.equal(src.kind, 'affiliate');
    assert.equal(src.disclosure, true);
  }
});

/* ---------------- 스케줄 ---------------- */

test('주기별 타임테이블: 1·2·4·6·12·24회 개수와 정렬', () => {
  for (const f of FREQUENCIES) {
    const times = scheduleTimes(f.perDay);
    assert.equal(times.length, f.perDay);
    const minutes = times.map(toMinutes);
    for (let i = 1; i < minutes.length; i += 1) {
      if (f.perDay !== 12 && f.perDay !== 24) assert.ok(minutes[i] > minutes[i - 1]);
    }
    for (const t of times) assert.match(t, /^([01]\d|2[0-3]):[0-5]\d$/);
  }
});

test('매일 4회는 09:00 · 13:00 · 18:00 · 22:00', () => {
  assert.deepEqual(scheduleTimes(4), ['09:00', '13:00', '18:00', '22:00']);
});

test('지원하지 않는 주기는 오류', () => {
  assert.throws(() => scheduleTimes(3), /지원하지 않는 주기/);
});

test('타임라인은 채널을 순환 배정하고 포맷 호환을 지킨다', () => {
  const line = buildTimeline(4, ['instagram', 'x'], '2026-11-27');
  assert.equal(line.length, 4);
  assert.deepEqual(line.map((s) => s.channelId), ['instagram', 'x', 'instagram', 'x']);
  for (const slot of line) {
    assert.ok(getChannel(slot.channelId).formats.includes(slot.formatId));
    assert.equal(slot.dateISO, '2026-11-27');
  }
});

test('다음 슬롯: 오전이면 오늘 09:00, 밤 23시면 내일 첫 슬롯', () => {
  const morning = new Date(2026, 10, 27, 8, 30);
  assert.deepEqual(nextSlot(4, morning), { time: '09:00', dayOffset: 0 });
  const night = new Date(2026, 10, 27, 23, 10);
  assert.deepEqual(nextSlot(4, night), { time: '09:00', dayOffset: 1 });
});

test('날짜 유틸: dateKey / addDays', () => {
  const d = new Date(2026, 10, 27, 12, 0);
  assert.equal(dateKey(d), '2026-11-27');
  assert.equal(addDays('2026-11-27', 1), '2026-11-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

/* ---------------- 생성 ---------------- */

test('채널·포맷 불일치는 생성 전에 거부한다', () => {
  const bad = validateRequest({ goalId: 'affiliate', channelId: 'tiktok', formatId: 'blog' });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /지원하지 않습니다/);
  const good = validateRequest({ goalId: 'affiliate', channelId: 'instagram', formatId: 'cardnews' });
  assert.equal(good.ok, true);
});

test('9개 목표가 서로 다른 훅·CTA를 만든다', () => {
  const seenHook = new Set();
  const seenCta = new Set();
  for (const g of GOALS) {
    const content = generateContent({ topic: '연말정산 환급', goalId: g.id, channelId: 'instagram', formatId: 'cardnews', sourceId: 'self' });
    assert.equal(content.meta.goalId, g.id);
    seenHook.add(content.hook);
    seenCta.add(content.cta.text);
  }
  assert.ok(seenHook.size >= 8, `훅 종류 ${seenHook.size}`);
  assert.ok(seenCta.size >= 8, `CTA 종류 ${seenCta.size}`);
});

test('카드뉴스는 최대 8장이고 표지·CTA가 포함된다', () => {
  const c = generateContent({ topic: '연말정산', goalId: 'affiliate', channelId: 'instagram', formatId: 'cardnews', sourceId: 'coupang' });
  assert.ok(c.cardnews.slides.length <= 8);
  assert.ok(c.cardnews.slides.length >= 5);
  assert.equal(c.cardnews.slides[0].emphasis, true);
  for (const slide of c.cardnews.slides) {
    assert.ok(slide.headline.length > 0);
    assert.ok(slide.headline.length <= 60);
  }
});

test('제휴 소스는 공정위 문구가 들어가고, 토글 OFF면 빠진다', () => {
  const on = generateContent({ topic: '무선청소기', goalId: 'affiliate', channelId: 'instagram', formatId: 'cardnews', sourceId: 'coupang', disclosure: true });
  assert.match(on.disclosure, /수수료를 제공받습니다/);
  assert.ok(on.cardnews.slides.some((s) => s.kicker === 'DISCLOSURE'));
  assert.match(on.blog.html, /수수료를 제공받습니다/);

  const off = generateContent({ topic: '무선청소기', goalId: 'affiliate', channelId: 'instagram', formatId: 'cardnews', sourceId: 'coupang', disclosure: false });
  assert.equal(off.disclosure, null);
  assert.ok(!off.blog.html.includes('수수료를 제공받습니다'));
});

test('비제휴 소스·목표에는 대가성 문구가 붙지 않는다', () => {
  const c = generateContent({ topic: '오늘 이슈', goalId: 'newspic', channelId: 'x', formatId: 'sns', sourceId: 'newspic-web' });
  assert.equal(c.disclosure, null);
});

test('X 스레드는 각 트윗이 280자 이내다', () => {
  const longTopic = '아주 긴 주제 '.repeat(20);
  const c = generateContent({ topic: longTopic, goalId: 'adsense', channelId: 'x', formatId: 'sns' });
  assert.ok(c.sns.x.length >= 3);
  for (const t of c.sns.x) assert.ok(charCount(t) <= 280, `트윗 ${charCount(t)}자`);
});

test('블로그 HTML은 사용자 입력을 이스케이프한다', () => {
  const c = generateContent({ topic: '<script>alert(1)</script>', goalId: 'adsense', channelId: 'blogger', formatId: 'blog', sourceId: 'my-site' });
  assert.ok(!c.blog.html.includes('<script>'));
  assert.ok(c.blog.html.includes('&lt;script&gt;'));
  assert.ok(c.blog.wordCount > 50);
});

test('쇼츠 대본은 6개 씬과 3초 훅을 가진다', () => {
  const c = generateContent({ topic: '환율 계산', goalId: 'shortform', channelId: 'youtube', formatId: 'reels' });
  assert.equal(c.shorts.scenes.length, 6);
  assert.equal(c.shorts.scenes[0].time, '0-3초');
  assert.ok(c.shorts.hook3s.length > 0);
  assert.equal(c.shorts.subtitlePackage.length, 6);
});

test('톤에 따라 본문 말투가 달라진다', () => {
  const info = generateContent({ topic: '주제', goalId: 'naver', channelId: 'naver', formatId: 'blog', tone: 'info', seed: 1 });
  const friendly = generateContent({ topic: '주제', goalId: 'naver', channelId: 'naver', formatId: 'blog', tone: 'friendly', seed: 1 });
  assert.notEqual(info.blog.text, friendly.blog.text);
});

test('링크 UTM 태깅', () => {
  const link = buildLink('https://cones.info/?a=1', 'adsense', 'x');
  assert.match(link, /utm_source=x/);
  assert.match(link, /utm_medium=sns-autopilot/);
  assert.match(link, /utm_campaign=adsense/);
  assert.equal(buildLink('', 'adsense', 'x'), '');
  assert.equal(buildLink('not-a-url', 'adsense', 'x'), 'not-a-url');
});

test('멀티 채널 패키지: 채널 수만큼, 포맷 호환 유지', () => {
  const pack = buildMultiChannelPack({ topic: '연말정산', goalId: 'repurpose', sourceId: 'self', formatId: 'blog' }, ['blogger', 'x', 'tiktok']);
  assert.equal(pack.length, 3);
  for (const c of pack) {
    const ch = getChannel(c.meta.channelId);
    assert.ok(ch.formats.includes(c.meta.formatId));
  }
});

test('escapeHtml · charCount · truncateChars', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(charCount('안녕🙂'), 3);
  assert.equal(truncateChars('abcdef', 4), 'abc…');
  assert.equal(truncateChars('abc', 4), 'abc');
});

/* ---------------- 큐 ---------------- */

const makeContent = (overrides = {}) =>
  generateContent({ topic: '연말정산', goalId: 'affiliate', channelId: 'instagram', formatId: 'cardnews', sourceId: 'self', ...overrides });

test('큐 항목 생성과 상태 전이', () => {
  const item = makeQueueItem(makeContent(), { scheduledAt: '2026-11-27T09:00:00' });
  assert.equal(item.status, 'pending');
  assert.ok(item.id.startsWith('q_'));
  assert.equal(item.channelId, 'instagram');

  const approved = transitionQueue([item], item.id, 'approved');
  assert.equal(approved[0].status, 'approved');
  const published = transitionQueue(approved, item.id, 'published');
  assert.equal(published[0].status, 'published');
  const back = transitionQueue(published, item.id, 'pending');
  assert.equal(back[0].status, 'published', '발행 완료는 되돌리지 않는다');
  assert.equal(canTransition('skipped', 'pending'), true);
  assert.equal(canTransition('published', 'approved'), false);
});

test('큐 요약과 날짜 필터', () => {
  const a = makeQueueItem(makeContent(), { scheduledAt: '2026-11-27T09:00:00' });
  const b = makeQueueItem(makeContent(), { scheduledAt: '2026-11-28T09:00:00', status: 'published' });
  const sums = summarizeQueue([a, b]);
  assert.equal(sums.total, 2);
  assert.equal(sums.pending, 1);
  assert.equal(sums.published, 1);
  assert.equal(sums.remaining, 1);
  assert.equal(queueForDate([a, b], '2026-11-27').length, 1);
});

test('하루 스케줄 채우기: 4개 추가, 두 번째 호출은 중복 건너뜀', () => {
  const buildContent = (slot) =>
    generateContent({ topic: '연말정산', goalId: 'affiliate', sourceId: 'self', channelId: slot.channelId, formatId: slot.formatId });
  const now = new Date(2026, 10, 27, 8, 0);
  const first = fillDayQueue([], { perDay: 4, dateISO: '2026-11-27', channels: ['instagram'], buildContent, now });
  assert.equal(first.added.length, 4);
  assert.equal(first.skipped, 0);
  assert.deepEqual(first.added.map((q) => q.scheduledAt.slice(11, 16)), ['09:00', '13:00', '18:00', '22:00']);
  assert.ok(first.added.every((q) => q.status === 'pending'));

  const second = fillDayQueue(first.queue, { perDay: 4, dateISO: '2026-11-27', channels: ['instagram'], buildContent, now });
  assert.equal(second.added.length, 0);
  assert.equal(second.skipped, 4);
});

test('자동 모드는 API 채널만 승인 상태로 만든다', () => {
  const buildContent = (slot) =>
    generateContent({ topic: '연말정산', goalId: 'affiliate', sourceId: 'self', channelId: slot.channelId, formatId: slot.formatId });
  const { added } = fillDayQueue([], { perDay: 2, dateISO: '2026-11-27', channels: ['instagram', 'naver'], mode: 'auto', buildContent, now: new Date(2026, 10, 27, 8, 0) });
  const byChannel = Object.fromEntries(added.map((q) => [q.channelId, q.status]));
  assert.equal(byChannel.instagram, 'approved');
  assert.equal(byChannel.naver, 'pending');
});

/* ---------------- 저장소 ---------------- */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

test('기본 상태: 주기 4회 · 톤 info · 프리뷰 모드', () => {
  const s = defaultState();
  assert.equal(s.perDay, 4);
  assert.equal(s.settings.provider, 'preview');
  assert.equal(s.settings.mode, 'semi');
  assert.equal(s.publishChannels.length, 9);
});

test('브랜드 표기 기본값은 코네스이고, 비워도 코네스로 복원된다', () => {
  assert.equal(defaultState().settings.brandName, '코네스');
  assert.equal(mergeState({ settings: { brandName: '' } }).settings.brandName, '코네스');
  assert.equal(mergeState({ settings: { brandName: '   ' } }).settings.brandName, '코네스');
  assert.equal(mergeState({ settings: { brandName: null } }).settings.brandName, '코네스');
  assert.equal(mergeState({}).settings.brandName, '코네스');
  // 예전 기본값 '한일 님'이 저장돼 있던 브라우저도 새 기본값으로 옮긴다
  assert.equal(mergeState({ settings: { brandName: '한일 님' } }).settings.brandName, '코네스');
  // 사용자가 직접 넣은 값은 그대로 유지(앞뒤 공백 제거, 30자 제한)
  assert.equal(mergeState({ settings: { brandName: '  머니큐브  ' } }).settings.brandName, '머니큐브');
  assert.equal(mergeState({ settings: { brandName: '가'.repeat(40) } }).settings.brandName.length, 30);
  // 저장 라운드트립에서도 코네스 유지
  const storage = fakeStorage();
  saveState(defaultState(), storage);
  assert.equal(loadState(storage).settings.brandName, '코네스');
});

test('상태 병합: 누락 필드 보강, 잘못된 테마 방어', () => {
  const merged = mergeState({ settings: { theme: 'neon' }, perDay: 99, queue: [{ id: 'x' }] });
  assert.equal(merged.settings.theme, 'dark');
  assert.equal(merged.perDay, 4);
  assert.equal(merged.queue.length, 0, 'content 없는 항목은 버린다');
  assert.equal(merged.connections.instagram.connected, false);
});

test('저장 → 불러오기 라운드트립', () => {
  const storage = fakeStorage();
  const state = defaultState();
  state.keyword = '연말정산';
  state.queue.push(makeQueueItem(makeContent(), { scheduledAt: '2026-11-27T09:00:00' }));
  assert.equal(saveState(state, storage), true);
  const loaded = loadState(storage);
  assert.equal(loaded.keyword, '연말정산');
  assert.equal(loaded.queue.length, 1);
  assert.equal(loaded.queue[0].title, state.queue[0].title);
});

test('JSON 내보내기 → 불러오기, 다른 앱 파일은 거부', () => {
  const state = defaultState();
  state.queue.push(makeQueueItem(makeContent(), { scheduledAt: '2026-11-27T09:00:00' }));
  const text = exportJSON(state);
  const result = importJSON(text);
  assert.equal(result.ok, true);
  assert.equal(result.state.queue.length, 1);

  assert.equal(importJSON('{ broken').ok, false);
  assert.equal(importJSON('{"app":"다른 앱","state":{}}').ok, false);
});

test('목표 믹스 정규화는 합이 100', () => {
  const mix = normalizeMix({ affiliate: 3, adsense: 3, newspic: 4 });
  const sum = Object.values(mix).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});
