// 뉴스픽 파트너스 전용 포맷 — 후킹 본문(2~3줄) + 연결 댓글(제휴 링크)
// 본문에는 링크를 절대 넣지 않고, 링크·댓글 유도는 '연결 댓글'로 분리합니다.
// 브라우저(프리뷰 생성기·UI)와 Node 테스트가 함께 씁니다.

export const PARTNER_SOURCE_ID = 'newspic-partners';

export function isPartnerSource(sourceId) {
  return String(sourceId || '') === PARTNER_SOURCE_ID;
}

const BODY_FRAMES = [
  (topic) => [
    `${topic} — 지금 뉴스픽에서 가장 많이 본 기사입니다.`,
    '사람들이 놀란 이유가 따로 있었습니다.',
    '3줄로 정리하면 이렇습니다.',
  ],
  (topic) => [
    `${topic}`,
    '이게 왜 이슈인지 아직 모르는 분이 많습니다.',
    '핵심만 보면 생각보다 단순합니다.',
  ],
  (topic) => [
    `${topic} — 결론부터 말하면 이렇습니다.`,
    '처음 보도가 나왔을 때와 지금 상황이 다릅니다.',
  ],
  (topic) => [
    `${topic} 한 줄 요약 들어갑니다.`,
    '놓치면 다음 소식에서 더 헷갈립니다.',
    '배경부터 순서대로 보세요.',
  ],
  (topic) => [
    `${topic}, 이건 꼭 짚고 넘어가야 합니다.`,
    '숫자 하나가 전부를 바꿔 놓았습니다.',
  ],
];

const COMMENT_FRAMES = [
  (link) => `전체 기사는 여기서 볼 수 있습니다 👇\n${link}\n\n읽고 어떻게 생각하시는지 한 줄만 남겨주세요. 댓글 읽고 다음 소재 정합니다.`,
  (link) => `원문 · 전체 내용 링크입니다.\n${link}\n\n의견 있으면 댓글로 알려주세요. 궁금한 점은 다음 편에서 정리합니다.`,
  (link) => `${link}\n\n이 기사 보고 드는 생각, 한 줄만 남겨주세요. 반응 좋은 주제로 이어가겠습니다.`,
];

function pickIndex(list, seed) {
  if (!list.length) return 0;
  const n = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return n % list.length;
}

/**
 * 뉴스픽 파트너스 본문·연결 댓글 생성
 * @param {object} opts {topic, link, seed, disclosure}
 * @returns {{body:string, lines:string[], comment:string, link:string, missingLink:boolean, isPartner:boolean}}
 */
export function buildPartnerCopy({ topic = '', link = '', seed = 0, disclosure = null } = {}) {
  const safeTopic = String(topic || '').trim() || '오늘의 이슈';
  const lines = BODY_FRAMES[pickIndex(BODY_FRAMES, seed)](safeTopic).map((line) => line.trim());
  const body = lines.join('\n');
  const trimmedLink = String(link || '').trim();
  const commentBase = COMMENT_FRAMES[pickIndex(COMMENT_FRAMES, seed + 1)](trimmedLink || '링크는 프로필에 있습니다.');
  const comment = disclosure ? `${commentBase}\n\n${disclosure}` : commentBase;
  return {
    body,
    lines,
    comment,
    link: trimmedLink,
    missingLink: !trimmedLink,
    isPartner: true,
  };
}

/** 본문에 링크가 섞여 들어가지 않도록 제거 (AI 응답 방어) */
export function stripLinks(text = '') {
  return String(text)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 본문 줄 수가 2~3줄을 벗어나지 않게 정리 */
export function clampBodyLines(text = '', { min = 2, max = 3 } = {}) {
  const lines = stripLinks(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const picked = lines.slice(0, max);
  while (picked.length < min) picked.push('');
  return picked.filter(Boolean).join('\n');
}
