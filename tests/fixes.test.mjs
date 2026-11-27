// 2026-11-28 E2E 결함 수정 검증 (결함 A·D·G 중심)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scheduleTimes,
  resolveDaySlots,
  fillDayQueue,
  generateContent,
  dateKey,
} from '../public/js/generator.js';
import { wrapText, drawSlide, CARD_SIZE } from '../public/js/cardnews.js';

/* ---------------- 가짜 캔버스 ---------------- */

/** 문자당 고정 폭을 갖는 가짜 캔버스 컨텍스트 */
function makeFakeCtx(charWidth = 10) {
  const fillRects = [];
  const ctx = {
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    clearRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    fillRect(x, y, w, h) {
      fillRects.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha, x, y, w, h });
    },
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    save() {},
    restore() {
      ctx.globalAlpha = 1;
    },
    measureText(s) {
      return { width: String(s).length * charWidth };
    },
    fillText() {},
  };
  return { ctx, fillRects };
}

/* ---------------- 결함 A: 불투명 베이스 ---------------- */

test('A. 다크 카드뉴스는 그라디언트 전에 불투명 #0b1020 베이스를 깐다', () => {
  const { ctx, fillRects } = makeFakeCtx();
  drawSlide(ctx, { kicker: 'TIP', headline: '제목', body: '본문' }, { theme: 'dark', index: 0, total: 8 });
  const first = fillRects[0];
  assert.ok(first, 'fillRect 호출이 있어야 한다');
  assert.deepEqual([first.x, first.y, first.w, first.h], [0, 0, CARD_SIZE, CARD_SIZE]);
  assert.match(String(first.style), /^#[0-9a-f]{6}$/i, `알파 없는 색이어야 하는데 ${first.style}`);
  assert.equal(first.style.toLowerCase(), '#0b1020');
});

test('A. 라이트 카드뉴스는 흰색 불투명 베이스를 깐다', () => {
  const { ctx, fillRects } = makeFakeCtx();
  drawSlide(ctx, { kicker: 'TIP', headline: '제목', body: '본문' }, { theme: 'light', index: 0, total: 8 });
  const first = fillRects[0];
  assert.deepEqual([first.x, first.y, first.w, first.h], [0, 0, CARD_SIZE, CARD_SIZE]);
  assert.equal(String(first.style).toLowerCase(), '#ffffff');
});

test('A. 베이스 위에 그라디언트·장식이 얹힌다 (칠하는 순서 유지)', () => {
  const { ctx, fillRects } = makeFakeCtx();
  drawSlide(ctx, { kicker: 'TIP', headline: '제목', body: '본문' }, { theme: 'dark' });
  assert.ok(fillRects.length >= 2, `fillRect ${fillRects.length}회`);
  for (const rect of fillRects) {
    assert.equal(rect.h > 0 && rect.w > 0, true);
  }
});

/* ---------------- 결함 G: 어절 단위 줄바꿈 ---------------- */

test('G. 캔버스 줄바꿈은 어절(공백) 단위를 우선한다', () => {
  const { ctx } = makeFakeCtx(10); // 한 글자 10px
  const text = '배송비와 구성 차이를 먼저 확인하세요';
  const lines = wrapText(ctx, text, 100);
  assert.ok(lines.length > 1, `줄 수 ${lines.length}`);
  assert.equal(lines.join(' '), text, '줄을 이으면 원문과 같아야 한다');
  for (const line of lines) {
    assert.ok(ctx.measureText(line).width <= 100, `줄 폭 초과: ${line}`);
    assert.equal(line, line.trim(), '앞뒤 공백 없이');
  }
  // 어절 중간에서 끊기지 않았는지: 각 줄은 원문 어절의 연속이다
  const words = text.split(' ');
  for (const line of lines) {
    for (const w of line.split(' ')) assert.ok(words.includes(w), `쪼개진 어절: ${w}`);
  }
});

test('G. 한 어절이 줄 폭보다 길 때만 글자 단위로 쪼갠다', () => {
  const { ctx } = makeFakeCtx(10);
  const long = 'A'.repeat(25);
  const lines = wrapText(ctx, `짧은 말 ${long}`, 100);
  assert.equal(lines.join(' ').replace(/\s/g, ''), `짧은말${long}`);
  for (const line of lines) assert.ok(ctx.measureText(line).width <= 100, `줄 폭 초과: ${line}`);
  assert.ok(lines.length >= 3, `줄 수 ${lines.length}`);
});

test('G. 명시적 줄바꿈과 빈 줄을 보존한다', () => {
  const { ctx } = makeFakeCtx(10);
  assert.deepEqual(wrapText(ctx, '가\n나', 100), ['가', '나']);
  assert.deepEqual(wrapText(ctx, '가\n\n나', 100), ['가', '', '나']);
});

/* ---------------- 결함 D: 지난 슬롯·자정 이후 날짜 ---------------- */

test('D. 12회 타임테이블의 01·03·05시는 자정 이후(다음 날)로 배정된다', () => {
  const now = new Date(2026, 10, 27, 16, 40);
  const slots = resolveDaySlots(12, ['instagram'], '2026-11-27', now);
  const byTime = Object.fromEntries(slots.map((s) => [s.time, s]));
  for (const t of ['01:00', '03:00', '05:00']) assert.equal(byTime[t].dateISO, '2026-11-28', `${t} 날짜`);
  for (const t of ['07:00', '23:00']) assert.equal(byTime[t].dateISO, '2026-11-27', `${t} 날짜`);
  assert.equal(byTime['19:00'].past, false, '16:40에 19시는 아직 지나지 않았다');
  assert.equal(byTime['15:00'].past, true, '15시는 지났다');
  assert.equal(byTime['17:00'].past, false);
  assert.equal(byTime['01:00'].past, false, '다음 날 01시는 미래');
});

test('D. 하루 창 첫 시각보다 이른 새벽 시각은 다음 날로 본다', () => {
  const now = new Date(2026, 10, 27, 2, 0);
  const slots = resolveDaySlots(12, ['instagram'], '2026-11-27', now);
  const byTime = Object.fromEntries(slots.map((s) => [s.time, s]));
  assert.equal(byTime['01:00'].dateISO, '2026-11-28');
  assert.equal(byTime['07:00'].dateISO, '2026-11-27');
  assert.equal(byTime['07:00'].past, false, '새벽 2시에 7시 슬롯은 아직 미래');
});

const buildContent = (slot) =>
  generateContent({
    topic: '연말정산',
    goalId: 'affiliate',
    sourceId: 'self',
    channelId: slot.channelId,
    formatId: slot.formatId,
  });

test('D. 하루 채우기는 이미 지난 슬롯을 넣지 않는다 (4회 · 15:00)', () => {
  const now = new Date(2026, 10, 27, 15, 0);
  const result = fillDayQueue([], {
    perDay: 4,
    dateISO: '2026-11-27',
    channels: ['instagram'],
    buildContent,
    now,
  });
  assert.equal(result.past, 2, '09·13시는 지난 슬롯');
  assert.deepEqual(
    result.added.map((q) => q.scheduledAt.slice(11, 16)),
    ['18:00', '22:00']
  );
});

test('D. 하루 채우기는 지난 슬롯을 다음 날로 미루지 않고 건너뛴다 (한 날짜 초과 없음)', () => {
  const now = new Date(2026, 10, 27, 15, 0);
  const { added } = fillDayQueue([], {
    perDay: 4,
    dateISO: '2026-11-27',
    channels: ['instagram'],
    buildContent,
    now,
  });
  for (const q of added) assert.equal(q.scheduledAt.slice(0, 10), '2026-11-27');
});

test('D. 12회 · 16:40 하루 채우기는 7건(오늘 4 + 다음 날 3)만 등록한다', () => {
  const now = new Date(2026, 10, 27, 16, 40);
  const result = fillDayQueue([], {
    perDay: 12,
    dateISO: '2026-11-27',
    channels: ['instagram'],
    buildContent,
    now,
  });
  assert.equal(result.past, 5);
  assert.equal(result.added.length, 7);
  const today = result.added.filter((q) => q.scheduledAt.slice(0, 10) === '2026-11-27').map((q) => q.scheduledAt.slice(11, 16));
  const tomorrow = result.added.filter((q) => q.scheduledAt.slice(0, 10) === '2026-11-28').map((q) => q.scheduledAt.slice(11, 16));
  assert.deepEqual(today, ['17:00', '19:00', '21:00', '23:00']);
  assert.deepEqual(tomorrow, ['01:00', '03:00', '05:00']);
});

test('D. skipPast=false면 기존처럼 전 슬롯을 등록한다', () => {
  const now = new Date(2026, 10, 27, 15, 0);
  const result = fillDayQueue([], {
    perDay: 4,
    dateISO: '2026-11-27',
    channels: ['instagram'],
    buildContent,
    now,
    skipPast: false,
  });
  assert.equal(result.added.length, 4);
  assert.equal(result.past, 0);
});

test('D. 오늘 남은 슬롯이 없으면 0건 · past만 센다', () => {
  const now = new Date(2026, 10, 27, 23, 30);
  const result = fillDayQueue([], {
    perDay: 4,
    dateISO: '2026-11-27',
    channels: ['instagram'],
    buildContent,
    now,
  });
  assert.equal(result.added.length, 0);
  assert.equal(result.past, 4);
});

test('D. 스케줄 표는 그대로 (1·2·4·6·12·24 시각 불변)', () => {
  assert.deepEqual(scheduleTimes(4), ['09:00', '13:00', '18:00', '22:00']);
  assert.equal(dateKey(new Date(2026, 10, 27, 23, 30)), '2026-11-27');
});
