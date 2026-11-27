// SNS 오토파일럿 — 생성 엔진 (순수 함수)
// 브라우저 UI, Cloudflare Function, Node 단위 테스트가 같은 규칙을 공유합니다.
// AI 키가 없을 때도 이 엔진이 4종 포맷을 구조화된 '프리뷰 템플릿'으로 즉시 만들어 줍니다.

import {
  CHANNELS,
  FORMATS,
  GOALS,
  SOURCES,
  FREQUENCIES,
  DISCLOSURE_TEXT,
  getChannel,
  getFormat,
  getGoal,
  getSource,
  getFrequency,
  formatsForChannel,
} from './data.js';

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */

export function hashString(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function pick(list, seed, offset = 0) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list[(seed + offset) % list.length];
}

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function charCount(str = '') {
  return [...String(str)].length;
}

export function truncateChars(str, max) {
  const chars = [...String(str)];
  if (chars.length <= max) return String(str);
  return `${chars.slice(0, Math.max(0, max - 1)).join('')}…`;
}

/* ------------------------------------------------------------------ */
/* 스케줄 · 타임테이블                                                 */
/* ------------------------------------------------------------------ */

/** 하루 게시 주기 → 'HH:MM' 배열 (오름차순, 24개 이하) */
export function scheduleTimes(perDay) {
  const freq = getFrequency(perDay);
  if (!freq) throw new Error(`지원하지 않는 주기입니다: ${perDay}`);
  return [...freq.times];
}

/** HH:MM 을 분으로 */
export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/**
 * 오늘의 타임테이블. 채널을 순환 배정해 하루 동안 여러 채널이 고르게 섞이게 합니다.
 * @param {number} perDay 1|2|4|6|12|24
 * @param {string[]} channelIds
 * @param {string} dateISO 기준일 (YYYY-MM-DD)
 */
export function buildTimeline(perDay, channelIds = ['instagram'], dateISO) {
  const times = scheduleTimes(perDay);
  const channels = channelIds.length ? channelIds : ['instagram'];
  return times.map((time, index) => {
    const channelId = channels[index % channels.length];
    const channel = getChannel(channelId);
    const formatId = channel ? channel.formats[index % channel.formats.length] : 'sns';
    return {
      time,
      dateISO,
      slot: index + 1,
      channelId,
      formatId,
      label: `${dateISO ? `${dateISO} ` : ''}${time}`,
    };
  });
}

/** 지금 이후 가장 가까운 예약 시각 (오늘 남은 슬롯 → 없으면 내일 첫 슬롯) */
export function nextSlot(perDay, now = new Date()) {
  const times = scheduleTimes(perDay);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = times.find((t) => toMinutes(t) > nowMin);
  if (today) return { time: today, dayOffset: 0 };
  return { time: times[0], dayOffset: 1 };
}

/** HH:MM 시각을 'YYYY-MM-DDTHH:MM:00' 형태로 */
function toDateTime(dateISO, time) {
  return `${dateISO}T${time}:00`;
}

/**
 * 하루 창의 슬롯을 실제 날짜·시각으로 확정합니다.
 * 하루 창은 타임테이블 첫 시각에서 시작해 자정을 넘기면 다음 날짜로 넘어갑니다.
 * (예: 12회 타임테이블의 01·03·05시는 첫 시각 07:00보다 이르므로 다음 날)
 * now보다 이른 슬롯은 past=true 로 표시합니다.
 * @returns {Array<{time, dateISO, scheduledAt, slot, channelId, formatId, past}>}
 */
export function resolveDaySlots(perDay, channelIds = ['instagram'], dateISO = dateKey(), now = new Date()) {
  const times = scheduleTimes(perDay);
  const dayStart = toMinutes(times[0]);
  const channels = channelIds.length ? channelIds : ['instagram'];
  const nowMs = now.getTime();
  return times.map((time, index) => {
    const minutes = toMinutes(time);
    const slotDateISO = minutes < dayStart ? addDays(dateISO, 1) : dateISO;
    const scheduledAt = toDateTime(slotDateISO, time);
    const channelId = channels[index % channels.length];
    const channel = getChannel(channelId);
    const formatId = channel ? channel.formats[index % channel.formats.length] : 'sns';
    return {
      time,
      dateISO: slotDateISO,
      scheduledAt,
      slot: index + 1,
      channelId,
      formatId,
      past: new Date(scheduledAt).getTime() <= nowMs,
      label: `${slotDateISO} ${time}`,
    };
  });
}

/** 로컬 날짜 YYYY-MM-DD */
export function dateKey(d = new Date()) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function addDays(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/* ------------------------------------------------------------------ */
/* 링크                                                                */
/* ------------------------------------------------------------------ */

/** 목표·채널별 UTM 태깅 — 어느 채널이 어떤 목표에 기여했는지 추적 */
export function buildLink(url, goalId, channelId) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', channelId || 'sns');
    u.searchParams.set('utm_medium', 'sns-autopilot');
    u.searchParams.set('utm_campaign', goalId || 'general');
    return u.toString();
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ */
/* 목표별 문구 자산                                                    */
/* ------------------------------------------------------------------ */

const HOOKS = {
  affiliate: [
    '{topic}, 살까 말까 고민된다면 이 3가지만 보세요.',
    '가격부터 옵션까지 — {topic} 고르는 기준을 정리했습니다.',
    '{topic} 사기 전에 꼭 비교해야 하는 한 가지.',
  ],
  naver: [
    '{topic}, 검색해서 나오는 정보가 왜 다를까요?',
    '{topic} 한 번에 정리했습니다 — 헷갈리는 부분만 골라서.',
    '{topic} 처음 알아보는 분께 필요한 순서대로 정리.',
  ],
  newspic: [
    '{topic}, 왜 지금 이슈인지 3줄로 정리했습니다.',
    '{topic} — 핵심만 남기면 이렇게 됩니다.',
    '오늘 {topic} 때문에 난리인 이유, 한 번에 보기.',
  ],
  adsense: [
    '{topic} 계산·비교, 직접 해보면 답이 보입니다.',
    '{topic} 끝까지 읽으면 바로 쓸 수 있는 표 하나.',
    '{topic}에서 사람들이 가장 많이 틀리는 부분.',
  ],
  event: [
    '{topic} — 마감 전에 확인해야 할 참여 조건.',
    '{topic}, 응모 방법이 생각보다 간단합니다.',
    '{topic} 혜택, 지금 안 하면 놓치는 이유.',
  ],
  audience: [
    '{topic} 시리즈, 다음 편부터 먼저 받아보세요.',
    '매일 하나씩 — {topic}을 3분으로 줄여 드립니다.',
    '{topic}만 모아 보내드리는 뉴스레터, 시작합니다.',
  ],
  shortform: [
    '3초 만에 결론부터: {topic}.',
    '{topic}, 이것만 알면 끝납니다.',
    '{topic} 30초 정리 — 마지막 한 줄이 핵심.',
  ],
  repurpose: [
    '글 하나로 9개 채널을 채우는 방법 — {topic} 예시.',
    '{topic} 한 편을 카드뉴스·쇼츠·스레드로 쪼개 봤습니다.',
    '{topic} 원문 하나에서 뽑아낸 4가지 포맷.',
  ],
  brand: [
    '{topic} — 숫자로 확인한 결과만 정리했습니다.',
    '{topic} 6개월 써보고 남은 것.',
    '{topic} 제안서에 넣을 만한 데이터 정리.',
  ],
};

const CTAS = {
  affiliate: ['가격·옵션은 프로필 링크에서 확인하세요.', '제품 링크는 댓글 고정에 두었습니다.', '최저가 비교표는 링크에서 바로 볼 수 있어요.'],
  naver: ['자세한 내용은 블로그 원문에서 이어집니다.', '전체 정리는 블로그에 올려 두었습니다.', '사진과 표는 블로그에서 보기 편하게 정리했어요.'],
  newspic: ['전체 내용은 뉴스픽에서 확인하세요.', '원문 링크는 프로필에 있습니다.', '속보 전체는 뉴스픽 링크로 이어집니다.'],
  adsense: ['계산기와 전체 표는 사이트에서 바로 쓸 수 있습니다.', '내 조건으로 계산해 보려면 링크를 눌러 주세요.', '자세한 기준은 사이트 원문에 정리했습니다.'],
  event: ['응모는 마감 전까지 · 링크 확인하세요.', '참여 링크는 프로필에 올려 두었습니다.', '오늘 안에 응모하면 추첨 대상입니다.'],
  audience: ['다음 편부터 먼저 받아보시려면 구독해 주세요.', '매일 한 편, 뉴스레터로 보내드립니다.', '카카오톡 채널 추가하면 놓치지 않습니다.'],
  shortform: ['끝까지 보셨다면 한 줄 요약 저장해 두세요.', '다음 편에서 이어집니다 — 팔로우!', '전체 정리는 고정 댓글에 있습니다.'],
  repurpose: ['원문 전체는 블로그에서, 요약은 이 글로 충분합니다.', '채널별 버전은 프로필에서 골라 보세요.', '같은 내용, 다른 포맷 — 원하는 채널에서 만나요.'],
  brand: ['협업·기고 문의는 메일로 부탁드립니다.', '자료 요청은 프로필의 연락처로 주세요.', '제안서는 링크에서 내려받을 수 있습니다.'],
};

const POINT_SETS = {
  affiliate: [
    ['무엇을 먼저 비교해야 하나', '가격만 보면 놓치는 배송·구성 차이', '반품·AS 조건까지 확인하는 순서'],
    ['같은 제품, 다른 가격인 이유', '쿠폰·카드 할인 적용 순서', '재고와 배송일까지 같이 보기'],
  ],
  naver: [
    ['헷갈리는 용어 3개 정리', '처음 알아볼 때 확인할 순서', '자주 하는 실수와 예방법'],
    ['검색해도 안 나오던 기준', '상황별로 고르는 방법', '한눈에 보는 체크리스트'],
  ],
  newspic: [
    ['무슨 일이 있었나', '왜 지금 문제가 됐나', '앞으로 확인할 점'],
    ['핵심 발언 3줄 요약', '숫자로 보는 배경', '다음 일정'],
  ],
  adsense: [
    ['내 조건으로 계산하는 순서', '결과가 달라지는 변수 3가지', '표로 비교하는 방법'],
    ['기준일과 적용 범위', '예외 조건 확인', '자주 틀리는 계산'],
  ],
  event: [
    ['참여 조건 3가지', '응모 가능 시간과 횟수', '당첨 발표·안내 방식'],
    ['필요한 준비물', '심사·추첨 기준', '탈락 사유 TOP 3'],
  ],
  audience: [
    ['이 시리즈에서 다루는 것', '얼마나 자주 오는지', '구독자만 받는 것'],
    ['한 편에 3분', '실무에 바로 쓰는 요약', '지난 편 다시 보기'],
  ],
  shortform: [
    ['결론 먼저', '이유 하나', '바로 쓰는 방법'],
    ['3초 훅', '중간 반전', '마지막 한 줄'],
  ],
  repurpose: [
    ['블로그 1편 → 카드뉴스 8장', '같은 글 → 쇼츠 45초 대본', '스레드 5개로 분해'],
    ['원문에서 뽑는 3가지', '채널별 말투 바꾸기', '링크 구조 통일'],
  ],
  brand: [
    ['무엇을 검증했나', '측정 방법', '결과와 한계'],
    ['사용 조건', '비교 대상', '추천하는 경우'],
  ],
};

const HASHTAG_SETS = {
  affiliate: ['#추천템', '#가격비교', '#내돈내산', '#살림템', '#쿠팡파트너스'],
  naver: ['#정보공유', '#정리', '#초보가이드', '#생활정보', '#블로그'],
  newspic: ['#이슈', '#뉴스요약', '#오늘의뉴스', '#3줄요약', '#뉴스픽'],
  adsense: ['#계산기', '#금융', '#절약', '#비교', '#머니큐브'],
  event: ['#이벤트', '#응모', '#경품', '#마감임박', '#eventpick'],
  audience: ['#뉴스레터', '#구독', '#매일한편', '#시리즈', '#카카오채널'],
  shortform: ['#쇼츠', '#릴스', '#꿀팁', '#30초요약', '#정보형'],
  repurpose: ['#원소스멀티유즈', '#콘텐츠재활용', '#블로그', '#카드뉴스', '#쇼츠'],
  brand: ['#리뷰', '#협찬', '#데이터', '#비교테스트', '#후기'],
};

const BODY_FRAMES = {
  info: (topic, points) =>
    `${topic}에 대해 알아볼 때 가장 먼저 확인할 것은 '무엇을 기준으로 비교할지'입니다.\n\n` +
    points.map((p, i) => `${i + 1}. ${p}`).join('\n') +
    `\n\n이 세 가지만 순서대로 확인하면 대부분의 경우는 정리됩니다.`,
  friendly: (topic, points) =>
    `${topic}, 저도 처음엔 어디서부터 봐야 할지 막막했어요.\n\n` +
    points.map((p, i) => `${i + 1}) ${p}`).join('\n') +
    `\n\n결론부터 말하면 이 순서만 지키면 됩니다.`,
  bold: (topic, points) =>
    `${topic} — 결론부터 말합니다.\n\n` +
    points.map((p, i) => `▪ ${p}`).join('\n') +
    `\n\n이 3개만 보면 나머지는 따라옵니다.`,
};

/* ------------------------------------------------------------------ */
/* 본문 생성                                                           */
/* ------------------------------------------------------------------ */

function resolveTopic(opts, source) {
  const raw = (opts.topic || opts.keyword || '').trim();
  if (raw) return raw;
  if (opts.sourceId === 'my-site') return '내 사이트 트래픽 늘리는 법';
  if (opts.sourceId === 'newspic-web' || opts.sourceId === 'newspic-partners') return '오늘의 이슈 3줄 요약';
  if (opts.sourceId === 'toss') return '연말정산 환급 늘리는 순서';
  if (opts.sourceId === 'coupang') return '연말 홈템 가격 비교';
  if (opts.sourceId === 'brandconnect') return '요즘 뜨는 브랜드 비교';
  return `${source ? source.name : '콘텐츠'} 주제`;
}

function defaultLink(source, goal) {
  if (source && source.linkBase) return source.linkBase;
  if (goal && goal.id === 'adsense') return 'https://cones.info/';
  return '';
}

export function validateRequest({ goalId, channelId, formatId }) {
  const errors = [];
  const goal = getGoal(goalId);
  const channel = getChannel(channelId);
  const format = getFormat(formatId);
  if (!goal) errors.push(`알 수 없는 목표: ${goalId}`);
  if (!channel) errors.push(`알 수 없는 채널: ${channelId}`);
  if (!format) errors.push(`알 수 없는 포맷: ${formatId}`);
  if (channel && format && !channel.formats.includes(format.id)) {
    errors.push(`${channel.name} 채널은 ${format.name} 포맷을 지원하지 않습니다.`);
  }
  return { ok: errors.length === 0, errors, goal, channel, format };
}

/**
 * 4종 포맷을 한 번에 담은 콘텐츠 패키지를 만듭니다.
 * @param {object} opts {topic, sourceId, goalId, channelId, formatId, link, disclosure, tone, seed, mode}
 */
export function generateContent(opts = {}) {
  const channelId = opts.channelId || 'instagram';
  const formatId = opts.formatId || (getChannel(channelId)?.formats[0] ?? 'sns');
  const goalId = opts.goalId || 'affiliate';
  const sourceId = opts.sourceId || 'self';
  const check = validateRequest({ goalId, channelId, formatId });
  if (!check.ok) throw new Error(check.errors.join(' '));

  const { goal, channel, format } = check;
  const source = getSource(sourceId) || SOURCES[4];
  const tone = opts.tone || 'info';
  const seed = Number.isFinite(opts.seed) ? opts.seed : hashString(`${opts.topic || ''}|${goalId}|${channelId}`);
  const topic = resolveTopic({ ...opts, sourceId }, source);
  const points = pick(POINT_SETS[goalId] || POINT_SETS.naver, seed);
  const hook = pick(HOOKS[goalId] || HOOKS.naver, seed, 1).replace(/\{topic\}/g, topic);
  const ctaText = pick(CTAS[goalId] || CTAS.naver, seed, 2);
  const rawLink = (opts.link || defaultLink(source, goal) || '').trim();
  const link = buildLink(rawLink, goalId, channelId);
  const needsDisclosure = opts.disclosure !== false && (goal.disclosure || source.kind === 'affiliate');

  const body = (BODY_FRAMES[tone] || BODY_FRAMES.info)(topic, points);
  const baseTags = [...(HASHTAG_SETS[goalId] || HASHTAG_SETS.naver), `#${channel.name.replace(/\s+/g, '')}`];
  const hashtags = [...new Set(baseTags)].slice(0, 10);

  const title = buildTitle(topic, goal, tone, seed);
  const seoTitle = truncateChars(`${title} | ${new Date().getFullYear()} 정리`, 60);
  const metaDescription = truncateChars(`${hook} ${points[0]}부터 ${points[2]}까지 순서대로 정리했습니다.`, 150);

  const shorts = buildShorts({ topic, hook, points, ctaText, tone, seed, hashtags });
  const cardnews = buildCardnews({ topic, hook, points, ctaText, link, disclosure: needsDisclosure, goal, channel, seed });
  const blog = buildBlog({ topic, title, seoTitle, metaDescription, hook, points, body, ctaText, link, disclosure: needsDisclosure ? DISCLOSURE_TEXT : null, hashtags, goal });
  const sns = buildSns({ topic, hook, points, ctaText, link, hashtags, channel });

  return {
    meta: {
      topic,
      sourceId: source.id,
      sourceName: source.name,
      goalId,
      goalName: goal.name,
      channelId,
      channelName: channel.name,
      formatId,
      formatName: format.name,
      apiSupported: channel.apiSupported,
      mode: opts.mode || 'preview',
      tone,
      seed,
      generatedAt: new Date().toISOString(),
      link,
      disclosure: needsDisclosure ? DISCLOSURE_TEXT : null,
    },
    title,
    seoTitle,
    metaDescription,
    hook,
    summary: points.map((p, i) => `${i + 1}. ${p}`).join(' / '),
    keyPoints: points,
    cta: { text: ctaText, label: goal.cta, link },
    hashtags,
    disclosure: needsDisclosure ? DISCLOSURE_TEXT : null,
    kpi: { metric: goal.metric, target: goal.kpi },
    shorts,
    cardnews,
    blog,
    sns,
    link,
    channel,
    format,
    goal,
  };
}

function buildTitle(topic, goal, tone, seed) {
  const y = new Date().getFullYear();
  const patterns = {
    affiliate: [
      `${topic} 비교 정리 — 사기 전에 보는 3가지 기준`,
      `${topic} 고르는 법: 가격·구성·AS 순서로 보기`,
      `${y} ${topic} 살 만한지 3분 정리`,
    ],
    naver: [
      `${topic} 한 번에 정리 (${y} 기준)`,
      `${topic} 초보 가이드 — 순서대로 따라하기`,
      `${topic}, 헷갈리는 부분만 모았습니다`,
    ],
    newspic: [`${topic} 3줄 요약 — 지금 이슈 정리`, `${topic}, 왜 난리인가`, `${topic} 핵심만 보기`],
    adsense: [`${topic} 계산기로 바로 확인하기`, `${topic} 비교표 — 내 조건으로 계산`, `${topic}, 숫자로 보는 기준`],
    event: [`${topic} 응모 방법과 마감 정리`, `${topic} — 조건·기간 한눈에`, `${topic} 놓치기 전 체크리스트`],
    audience: [`${topic} 시리즈 #1 — 매일 3분`, `${topic}, 구독자만 먼저 받는 정리`, `${topic} 뉴스레터 시작합니다`],
    shortform: [`${topic} 30초 정리`, `${topic}, 3초 안에 결론`, `${topic} — 이것만 보세요`],
    repurpose: [`${topic} 하나로 9채널 채우기`, `${topic} 원소스 멀티유즈 예시`, `${topic} 1편 → 4포맷 분해`],
    brand: [`${topic} 6개월 사용 후 데이터 정리`, `${topic} 비교 테스트 결과`, `${topic} 검증 노트`],
  };
  return pick(patterns[goal.id] || patterns.naver, seed, 3);
}

function buildShorts({ topic, hook, points, ctaText, tone, seed, hashtags }) {
  const sceneFrames = [
    { time: '0-3초', scene: '훅', visual: '얼굴 클로즈업 + 큰 자막', narration: hook, caption: truncateChars(hook, 20) },
    { time: '3-8초', scene: '문제', visual: '고민하는 표정 + 화면 분할', narration: `${topic}, 어디서부터 봐야 할지 모르겠다면?`, caption: '어디서부터 봐야 할까?' },
    { time: '8-18초', scene: '포인트 1', visual: '숫자 카드 + 체크 아이콘', narration: points[0], caption: truncateChars(points[0], 18) },
    { time: '18-28초', scene: '포인트 2', visual: '비교 화면 + 화살표', narration: points[1], caption: truncateChars(points[1], 18) },
    { time: '28-38초', scene: '포인트 3', visual: '체크리스트 애니메이션', narration: points[2], caption: truncateChars(points[2], 18) },
    { time: '38-45초', scene: 'CTA', visual: '링크 스티커 + 마무리 자막', narration: ctaText, caption: '저장해 두세요 🔖' },
  ];
  return {
    durationLabel: '45초 (9:16)',
    hook3s: hook,
    tone,
    scenes: sceneFrames,
    caption: `${hook}\n\n${points.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n${ctaText}\n\n${hashtags.slice(0, 6).join(' ')}`,
    hashtags,
    bgm: pick(['잔잔한 로파이 90BPM', '밝은 어쿠스틱 100BPM', '미니멀 신스 95BPM'], seed, 4),
    thumbnailText: truncateChars(hook, 14),
    subtitlePackage: sceneFrames.map((s) => `[${s.time}] ${s.caption}`),
  };
}

function shortLink(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    const clean = String(url).replace(/^https?:\/\//, '').replace(/\/$/, '');
    return clean.length > 32 ? `${clean.slice(0, 31)}…` : clean;
  }
}

function buildCardnews({ topic, hook, points, ctaText, link, disclosure, goal, channel, seed }) {
  const slides = [
    { kicker: goal.name, headline: truncateChars(topic, 22), body: truncateChars(hook, 46), emphasis: true },
    { kicker: 'WHY', headline: '왜 지금 봐야 할까', body: `${points[0]}부터 확인하면 판단이 빨라집니다.` },
    { kicker: 'POINT 1', headline: points[0], body: '가장 먼저 확인할 기준입니다.' },
    { kicker: 'POINT 2', headline: points[1], body: '여기서 대부분의 차이가 갈립니다.' },
    { kicker: 'POINT 3', headline: points[2], body: '마지막으로 꼭 확인하세요.' },
    { kicker: 'CHECK', headline: '한 줄 체크리스트', body: points.map((p) => `· ${p}`).join('\n') },
    { kicker: 'NEXT', headline: ctaText, body: link ? `프로필 링크 · ${shortLink(link)}` : `${channel.name} 프로필 링크 확인`, emphasis: true },
  ];
  if (disclosure) {
    slides.push({ kicker: 'DISCLOSURE', headline: '대가성 문구', body: DISCLOSURE_TEXT, small: true });
  }
  return {
    size: 1080,
    ratio: '1:1',
    maxSlides: 8,
    title: truncateChars(topic, 22),
    subtitle: hook,
    slides: slides.slice(0, 8),
    caption: `${topic} 정리했습니다.\n\n${points.map((p) => `✔ ${p}`).join('\n')}\n\n${ctaText}\n${disclosure ? `\n${DISCLOSURE_TEXT}` : ''}`,
    hashtags: ['#카드뉴스', '#정보', '#정리'],
  };
}

function buildBlog({ topic, title, seoTitle, metaDescription, hook, points, body, ctaText, link, disclosure, hashtags, goal }) {
  const outline = [
    { h2: `${topic}, 무엇부터 볼까`, points: [points[0], points[1]] },
    { h2: '실제로 확인하는 순서', points: [points[2], '표로 비교하면 차이가 바로 보입니다.'] },
    { h2: '자주 묻는 질문', points: ['기준일과 조건은 언제 달라지나요?', '예외는 어떤 경우인가요?'] },
  ];
  const faq = [
    { q: `${topic}은 어떤 기준으로 비교하면 되나요?`, a: `${points[0]} → ${points[1]} → ${points[2]} 순서로 보면 됩니다.` },
    { q: '정리된 내용이 언제까지 유효한가요?', a: '기준일 이후 조건이 바뀔 수 있으니 링크의 최신 안내를 함께 확인하세요.' },
    { q: '초보도 바로 쓸 수 있나요?', a: '위 순서대로 체크리스트만 따라가면 됩니다.' },
  ];
  const html = [
    `<p>${escapeHtml(hook)}</p>`,
    `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`,
    ...outline.flatMap((sec, i) => [
      `<h2>${escapeHtml(sec.h2)}</h2>`,
      ...sec.points.map((p) => `<p>${escapeHtml(p)}</p>`),
      i === 1 ? '<table><thead><tr><th>항목</th><th>확인 방법</th></tr></thead><tbody><tr><td>가격</td><td>할인 적용 후 최종가</td></tr><tr><td>구성</td><td>옵션·배송 포함 여부</td></tr><tr><td>조건</td><td>반품·AS 기간</td></tr></tbody></table>' : '',
    ]),
    '<h2>FAQ</h2>',
    ...faq.map((f) => `<p><strong>Q. ${escapeHtml(f.q)}</strong><br>A. ${escapeHtml(f.a)}</p>`),
    link ? `<p><a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(ctaText)}</a></p>` : `<p>${escapeHtml(ctaText)}</p>`,
    disclosure ? `<p><small>${escapeHtml(disclosure)}</small></p>` : '',
    `<p>${escapeHtml(hashtags.join(' '))}</p>`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    title: seoTitle,
    outline,
    html,
    text: `${title}\n\n${body}\n\n${ctaText}`,
    wordCount: charCount(html.replace(/<[^>]+>/g, '')),
    faq,
    metaDescription,
    seo: {
      title: seoTitle,
      description: metaDescription,
      keywords: hashtags.map((t) => t.replace('#', '')).slice(0, 8),
    },
    goal: goal.id,
  };
}

function buildSns({ topic, hook, points, ctaText, link, hashtags, channel }) {
  const tagLine = hashtags.slice(0, 4).join(' ');
  const single = truncateChars(`${hook}\n\n· ${points[0]}\n· ${points[1]}\n· ${points[2]}\n\n${link || ''}`.trim(), 260);
  const x = [
    truncateChars(`${hook}`, 260),
    truncateChars(`1/ ${points[0]}`, 270),
    truncateChars(`2/ ${points[1]}`, 270),
    truncateChars(`3/ ${points[2]}`, 270),
    truncateChars(`${ctaText} ${link || ''}`.trim(), 270),
  ];
  const threads = `${hook}\n\n${points.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n${ctaText}\n${hashtags.slice(0, 5).join(' ')}`.slice(0, 490);
  const facebook = `${topic} 정리\n\n${points.map((p) => `✅ ${p}`).join('\n')}\n\n${ctaText}\n${link || ''}`;
  return { single, x, threads, facebook, tagLine, channel: channel.id };
}

/* ------------------------------------------------------------------ */
/* 큐 항목                                                             */
/* ------------------------------------------------------------------ */

export function makeQueueItem(content, { scheduledAt, status = 'pending', id } = {}) {
  return {
    id: id || `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    scheduledAt: scheduledAt || new Date().toISOString(),
    status,
    channelId: content.meta.channelId,
    channelName: content.meta.channelName,
    formatId: content.meta.formatId,
    formatName: content.meta.formatName,
    goalId: content.meta.goalId,
    goalName: content.meta.goalName,
    title: content.title,
    mode: content.meta.mode,
    apiSupported: content.meta.apiSupported,
    createdAt: new Date().toISOString(),
    content,
  };
}

/** 큐 상태 전이 규칙 */
const TRANSITIONS = {
  pending: ['approved', 'skipped'],
  approved: ['published', 'skipped'],
  published: [],
  skipped: ['pending'],
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function transitionQueue(queue, id, to) {
  return (queue || []).map((item) => {
    if (item.id !== id) return item;
    if (!canTransition(item.status, to)) return item;
    return { ...item, status: to, updatedAt: new Date().toISOString() };
  });
}

export function summarizeQueue(queue = []) {
  const counts = { total: queue.length, pending: 0, approved: 0, published: 0, skipped: 0 };
  for (const item of queue) {
    if (counts[item.status] !== undefined) counts[item.status] += 1;
  }
  counts.remaining = counts.pending + counts.approved;
  return counts;
}

/** 오늘 날짜(YYYY-MM-DD) 큐만 추린다 */
export function queueForDate(queue = [], dateISO = dateKey()) {
  return queue
    .filter((item) => String(item.scheduledAt).slice(0, 10) === dateISO)
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
}

/**
 * 하루치 스케줄을 큐에 등록합니다.
 * - 같은 날 같은 슬롯이 이미 있으면 건너뜁니다.
 * - skipPast(기본 true)면 이미 지난 시각 슬롯은 넣지 않습니다.
 * - 자정을 넘긴 슬롯(12회의 01·03·05시 등)은 다음 날 날짜로 들어갑니다.
 * @returns {{queue:Array, added:Array, skipped:number, past:number}}
 */
export function fillDayQueue(
  queue,
  { perDay, dateISO = dateKey(), channels, buildContent, mode = 'semi', now = new Date(), skipPast = true }
) {
  const slots = resolveDaySlots(perDay, channels, dateISO, now);
  const added = [];
  let skipped = 0;
  let past = 0;
  let nextQueue = [...(queue || [])];
  slots.forEach((slot, index) => {
    if (skipPast && slot.past) {
      past += 1;
      return;
    }
    const key = slot.scheduledAt.slice(0, 16);
    const exists = nextQueue.some(
      (q) => String(q.scheduledAt).slice(0, 16) === key && q.channelId === slot.channelId
    );
    if (exists) {
      skipped += 1;
      return;
    }
    const content = buildContent({ ...slot, index });
    const item = makeQueueItem(content, {
      scheduledAt: slot.scheduledAt,
      status: mode === 'auto' && content.meta.apiSupported ? 'approved' : 'pending',
    });
    nextQueue.push(item);
    added.push(item);
  });
  return { queue: nextQueue, added, skipped, past };
}

/** 1개 소스 → 여러 채널 패키지 (원소스 멀티유즈) */
export function buildMultiChannelPack(opts, channelIds = []) {
  const pack = [];
  for (const channelId of channelIds) {
    const channel = getChannel(channelId);
    if (!channel) continue;
    const formatId = channel.formats.includes(opts.formatId) ? opts.formatId : channel.formats[0];
    pack.push(generateContent({ ...opts, channelId, formatId }));
  }
  return pack;
}

export const CONTENT_TYPES = FORMATS;
export const GOAL_COUNT = GOALS.length;
export const CHANNEL_COUNT = CHANNELS.length;
export { CHANNELS, FORMATS, GOALS, SOURCES, FREQUENCIES };
