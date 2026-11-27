// SNS 오토파일럿 — 카탈로그 데이터 (채널 · 포맷 · 수익 목표 · 소스 · 주기)
// UI와 생성 엔진이 함께 읽는 단일 출처입니다. 순수 데이터만 두어 Node 테스트에서도 그대로 import 합니다.

export const APP = {
  name: 'SNS 오토파일럿',
  version: '1.0.0',
  tagline: '매일 1회~24회 · 9개 채널 · 생성부터 발행 큐까지',
  storageKey: 'sns-autopilot-state-v1',
  site: 'https://sns-autopilot-bin.pages.dev',
};

/**
 * 게시 대상 채널. apiSupported=false 인 채널은 공식 글쓰기 API가 없어
 * '원클릭 복사 → 붙여넣기'로 발행한다.
 */
export const CHANNELS = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📸',
    color: '#e1306c',
    formats: ['reels', 'cardnews'],
    apiSupported: true,
    api: 'Meta Graph API (Business/Creator)',
    limit: '릴스 90초 · 캐러셀 최대 10장',
    tip: '릴스 첫 3초에 훅, 카드뉴스는 4:5가 저장률이 높습니다.',
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: '🧵',
    color: '#8b5cf6',
    formats: ['sns', 'cardnews'],
    apiSupported: true,
    api: 'Threads API (Meta)',
    limit: '500자 · 이미지 최대 20장',
    tip: '첫 글에 결론, 답글에 근거를 두는 2단 구조가 반응이 좋습니다.',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: '👥',
    color: '#1877f2',
    formats: ['sns', 'cardnews'],
    apiSupported: true,
    api: 'Meta Graph API (Page)',
    limit: '63,206자 · 카드뉴스 피드',
    tip: '링크 미리보기보다 본문 요약 + 카드 이미지가 도달에 유리합니다.',
  },
  {
    id: 'x',
    name: 'X',
    icon: '𝕏',
    color: '#e2e8f0',
    formats: ['sns', 'cardnews'],
    apiSupported: true,
    api: 'X API v2 (OAuth 1.0a/2.0)',
    limit: '280자 · 스레드 연속 게시',
    tip: '무료 플랜은 월 쓰기 한도가 작아 핵심 1~2회만 자동 발행하세요.',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    color: '#22d3ee',
    formats: ['reels'],
    apiSupported: true,
    api: 'Content Posting API (심사 필요)',
    limit: '최대 10분 · 9:16',
    tip: '자막은 화면 중앙보다 아래 1/3에 두면 가려지지 않습니다.',
  },
  {
    id: 'youtube',
    name: 'YouTube Shorts',
    icon: '▶️',
    color: '#ef4444',
    formats: ['reels'],
    apiSupported: true,
    api: 'YouTube Data API v3 (업로드 1,600 units)',
    limit: '3분 이내 · 9:16',
    tip: '일일 쿼터가 10,000 units이라 업로드는 하루 5~6건이 한계입니다.',
  },
  {
    id: 'blogger',
    name: 'Google Blogger',
    icon: '🅱️',
    color: '#f59e0b',
    formats: ['blog'],
    apiSupported: true,
    api: 'Blogger API v3 (cones.asia)',
    limit: 'HTML 원문 게시',
    tip: 'HTML 그대로 발행되므로 인라인 스타일을 함께 넣어야 예쁩니다.',
  },
  {
    id: 'naver',
    name: '네이버 블로그',
    icon: '🟢',
    color: '#03c75a',
    formats: ['blog'],
    apiSupported: false,
    api: '공식 글쓰기 API 종료',
    limit: '스마트에디터 붙여넣기',
    badge: 'API 종료 · 원클릭 복사',
    tip: 'HTML 대신 서식 있는 텍스트로 복사하면 스마트에디터에 그대로 들어갑니다.',
  },
  {
    id: 'tistory',
    name: '티스토리',
    icon: '🟠',
    color: '#ff5a4a',
    formats: ['blog'],
    apiSupported: false,
    api: '공식 글쓰기 API 종료',
    limit: '에디터 붙여넣기',
    badge: 'API 종료 · 원클릭 복사',
    tip: '티스토리는 HTML 모드가 있어 복사한 HTML을 그대로 붙여도 됩니다.',
  },
];

/** 4종 콘텐츠 포맷 */
export const FORMATS = [
  {
    id: 'reels',
    name: '쇼츠 · 릴스',
    engine: 'shorts',
    icon: '🎬',
    ratio: '9:16',
    desc: '3초 훅 · 씬 구성 · 자막 패키지',
    fields: ['hook3s', 'scenes', 'caption', 'hashtags'],
  },
  {
    id: 'cardnews',
    name: '카드뉴스',
    engine: 'cardnews',
    icon: '🖼️',
    ratio: '1:1',
    desc: '1080×1080 · 최대 8장 · PNG 저장',
    fields: ['slides', 'caption'],
  },
  {
    id: 'blog',
    name: '블로그 포스팅',
    engine: 'blog',
    icon: '📝',
    ratio: '본문',
    desc: 'SEO 제목 · 소제목 · HTML 복사',
    fields: ['seoTitle', 'outline', 'html', 'faq'],
  },
  {
    id: 'sns',
    name: 'SNS 단문 · 스레드',
    engine: 'sns',
    icon: '💬',
    ratio: '텍스트',
    desc: '280자 트윗 · 스레드 · 해시태그',
    fields: ['x', 'threads', 'facebook'],
  },
];

/**
 * 수익화 · 운영 목표 9종.
 * goal 마다 훅·문구·CTA·링크 구조가 달라지고, 제휴 소스일 때만 대가성 문구가 붙습니다.
 */
export const GOALS = [
  {
    id: 'affiliate',
    name: '판매수수료',
    sub: '쿠팡 · 네이버쇼핑 · 토스쇼핑',
    icon: '🛒',
    color: '#fb923c',
    kpi: '구매 전환 (CPS)',
    metric: '제휴 링크 클릭 → 구매',
    disclosure: true,
    linkLabel: '제휴 링크',
    hook: '구매 직전 망설임 제거 · 가격 비교',
    cta: '가격·옵션은 프로필 링크에서 확인',
  },
  {
    id: 'naver',
    name: '네이버 홈판 · 애드포스트',
    sub: '네이버 블로그 노출',
    icon: '🟢',
    color: '#4ade80',
    kpi: '노출 · 체류',
    metric: '홈판 노출 → 블로그 방문',
    disclosure: false,
    linkLabel: '블로그 원문',
    hook: '검색 의도에 딱 맞는 정보형 제목',
    cta: '자세한 내용은 블로그에서',
  },
  {
    id: 'newspic',
    name: '뉴스픽 조회수',
    sub: '뉴스픽 파트너스 · 뉴스픽 웹',
    icon: '📰',
    color: '#60a5fa',
    kpi: '조회수 (PV)',
    metric: '뉴스픽 링크 조회',
    disclosure: false,
    linkLabel: '뉴스픽 원문',
    hook: '이슈의 이유를 3줄로 정리',
    cta: '전체 내용은 뉴스픽에서',
  },
  {
    id: 'adsense',
    name: '애드센스 트래픽',
    sub: 'cones.info · cones.asia · 티스토리',
    icon: '💰',
    color: '#fbbf24',
    kpi: '유입 · 페이지뷰',
    metric: '내 사이트 유입',
    disclosure: false,
    linkLabel: '사이트 원문',
    hook: '끝까지 읽을 이유를 미리 던지기',
    cta: '계산기·전체 표는 사이트에서',
  },
  {
    id: 'event',
    name: '이벤트 · CPA 리워드',
    sub: 'event-pick · 금융·앱 가입',
    icon: '🎁',
    color: '#f472b6',
    kpi: '참여 · 전환',
    metric: '응모 링크 클릭',
    disclosure: false,
    linkLabel: '응모 링크',
    hook: '마감 임박 + 당첨 인원 숫자',
    cta: '응모는 오늘까지 · 링크 확인',
  },
  {
    id: 'audience',
    name: '구독자 · 팔로워 DB',
    sub: '뉴스레터 · 카카오톡 채널',
    icon: '👥',
    color: '#a78bfa',
    kpi: '구독 전환',
    metric: '팔로우 · 구독자 증가',
    disclosure: false,
    linkLabel: '구독 링크',
    hook: '이 시리즈를 계속 받아보는 이유',
    cta: '다음 편부터 먼저 받아보세요',
  },
  {
    id: 'shortform',
    name: '숏폼 조회수 · 리워드',
    sub: 'YouTube Shorts · TikTok',
    icon: '▶️',
    color: '#f87171',
    kpi: '조회수 · 시청 지속',
    metric: '3초 유지율 · 완주율',
    disclosure: false,
    linkLabel: '영상 링크',
    hook: '3초 안에 결론을 꺼내는 정보형 훅',
    cta: '끝까지 보면 마지막에 한 줄 정리',
  },
  {
    id: 'repurpose',
    name: '원소스 멀티유즈',
    sub: '블로그 1편 → 전 채널 분해',
    icon: '♻️',
    color: '#2dd4bf',
    kpi: '제작비 0원 확산',
    metric: '1개 소스 → 채널별 변환',
    disclosure: false,
    linkLabel: '원문 링크',
    hook: '한 편의 글을 9개 채널로 쪼개기',
    cta: '원문 전체는 블로그에서',
  },
  {
    id: 'brand',
    name: '브랜드 협찬 · 원고료',
    sub: '협찬 · 기고 · 제휴 제안',
    icon: '🤝',
    color: '#94a3b8',
    kpi: '제안 · 단가',
    metric: '브랜드 문의 → 계약',
    disclosure: true,
    linkLabel: '제안서 링크',
    hook: '전문성이 드러나는 데이터·경험',
    cta: '협업 문의는 메일로',
  },
];

/** 소스 & 제휴 허브 */
export const SOURCES = [
  {
    id: 'newspic-partners',
    name: '뉴스픽 파트너스',
    icon: '📰',
    kind: 'traffic',
    disclosure: false,
    placeholder: '뉴스픽 기사 제목 또는 링크',
    linkBase: 'https://news.nate.com/',
    hint: '조회수 정산 · 고수익 콘텐츠 20건 추적 파라미터 사용',
    goals: ['newspic', 'audience', 'shortform'],
  },
  {
    id: 'coupang',
    name: '쿠팡 파트너스',
    icon: '🛒',
    kind: 'affiliate',
    disclosure: true,
    placeholder: '상품명 또는 파트너스 링크',
    linkBase: 'https://link.coupang.com/',
    hint: '대가성 문구 필수 · 최저가보다 사용 후기 각도가 전환에 유리',
    goals: ['affiliate', 'brand'],
  },
  {
    id: 'brandconnect',
    name: '네이버 브랜드커넥트',
    icon: '🟩',
    kind: 'affiliate',
    disclosure: true,
    placeholder: '브랜드 · 상품명',
    linkBase: 'https://brandconnect.naver.com/',
    hint: '리뷰형 카드뉴스와 궁합이 좋습니다',
    goals: ['affiliate', 'brand'],
  },
  {
    id: 'toss',
    name: '토스 쉐어링크',
    icon: '💙',
    kind: 'affiliate',
    disclosure: true,
    placeholder: '금융 상품 · 혜택명',
    linkBase: 'https://toss.im/',
    hint: '조건·혜택을 숫자로 먼저 보여주기',
    goals: ['affiliate', 'event'],
  },
  {
    id: 'self',
    name: '자체 생성',
    icon: '✍️',
    kind: 'keyword',
    disclosure: false,
    placeholder: '키워드 또는 주제 (예: 연말정산 환급)',
    linkBase: '',
    hint: '키워드만 넣으면 4종 포맷을 한 번에 만듭니다',
    goals: ['all'],
  },
  {
    id: 'newspic-web',
    name: '뉴스픽 웹',
    icon: '🌐',
    kind: 'traffic',
    disclosure: false,
    placeholder: '뉴스픽 이슈 링크',
    linkBase: 'https://newspic.kr/',
    hint: '이슈 요약 → 원문 유도',
    goals: ['newspic', 'naver', 'adsense'],
  },
  {
    id: 'my-site',
    name: '내 사이트 URL',
    icon: '🔗',
    kind: 'site',
    disclosure: false,
    placeholder: 'https://cones.info 또는 https://cones.asia',
    linkBase: 'https://cones.info/',
    hint: '애드센스·체류 수익으로 바로 연결',
    goals: ['adsense', 'repurpose', 'audience'],
  },
];

/** 게시 주기 — 하루 몇 회인지에 따른 타임테이블 */
export const FREQUENCIES = [
  { perDay: 1, label: '매일 1회', times: ['19:00'] },
  { perDay: 2, label: '매일 2회', times: ['09:00', '19:00'] },
  { perDay: 4, label: '매일 4회', times: ['09:00', '13:00', '18:00', '22:00'] },
  { perDay: 6, label: '매일 6회', times: ['08:00', '11:00', '14:00', '17:00', '20:00', '23:00'] },
  {
    perDay: 12,
    label: '매일 12회',
    times: ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00', '23:00', '01:00', '03:00', '05:00'],
  },
  {
    perDay: 24,
    label: '매일 24회',
    times: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
  },
];

export const TONES = [
  { id: 'info', name: '정보형', desc: '담백한 정리 · 검색 친화' },
  { id: 'friendly', name: '친근형', desc: '말 거는 듯한 구어체' },
  { id: 'bold', name: '자극형', desc: '숫자·반전으로 시선 잡기' },
];

export const API_PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', model: 'gemini-2.5-flash', keyHint: 'AIza...' },
  { id: 'openrouter', name: 'OpenRouter', model: 'google/gemini-2.0-flash-exp:free', keyHint: 'sk-or-...' },
  { id: 'groq', name: 'Groq', model: 'llama-3.3-70b-versatile', keyHint: 'gsk_...' },
];

/** 공정위 대가성 문구 */
export const DISCLOSURE_TEXT =
  '이 콘텐츠는 파트너스 활동의 일환으로, 구매 시 일정액의 수수료를 제공받습니다.';

export const DEFAULT_GOAL_MIX = {
  affiliate: 30,
  adsense: 20,
  newspic: 15,
  event: 10,
  audience: 10,
  shortform: 5,
  naver: 5,
  repurpose: 3,
  brand: 2,
};

export const getChannel = (id) => CHANNELS.find((c) => c.id === id);
export const getFormat = (id) => FORMATS.find((f) => f.id === id);
export const getGoal = (id) => GOALS.find((g) => g.id === id);
export const getSource = (id) => SOURCES.find((s) => s.id === id);
export const getFrequency = (perDay) => FREQUENCIES.find((f) => f.perDay === Number(perDay));

export function channelsForFormat(formatId) {
  return CHANNELS.filter((c) => c.formats.includes(formatId));
}

export function formatsForChannel(channelId) {
  const ch = getChannel(channelId);
  return ch ? ch.formats.map(getFormat) : [];
}

export function defaultState() {
  return {
    version: 1,
    settings: {
      theme: 'dark',
      mode: 'semi', // semi | auto
      provider: 'preview', // preview | gemini | openrouter | groq
      keys: { gemini: '', openrouter: '', groq: '' },
      disclosure: true,
      tone: 'info',
      webhook: '',
      brandName: '한일 님',
      autoApprove: false,
    },
    focusGoal: 'affiliate',
    goalMix: { ...DEFAULT_GOAL_MIX },
    perDay: 4,
    publishChannels: CHANNELS.map((c) => c.id),
    sourceId: 'self',
    keyword: '',
    link: '',
    channel: 'instagram',
    format: 'cardnews',
    connections: Object.fromEntries(
      CHANNELS.map((c) => [c.id, { connected: false, handle: '' }])
    ),
    queue: [],
    counter: 0,
    lastGenerated: null,
  };
}
