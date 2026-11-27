// SNS 오토파일럿 — UI 컨트롤러

import {
  APP,
  CHANNELS,
  FORMATS,
  GOALS,
  SOURCES,
  FREQUENCIES,
  TONES,
  API_PROVIDERS,
  DISCLOSURE_TEXT,
  getChannel,
  getFormat,
  getGoal,
  getSource,
  defaultState,
} from './data.js';
import {
  generateContent,
  buildMultiChannelPack,
  scheduleTimes,
  buildTimeline,
  nextSlot,
  dateKey,
  makeQueueItem,
  summarizeQueue,
  queueForDate,
  transitionQueue,
  canTransition,
  fillDayQueue,
  escapeHtml,
  charCount,
  truncateChars,
} from './generator.js';
import { loadState, saveState, exportJSON, importJSON, resetState, normalizeMix } from './store.js';
import { renderSlideCanvas, drawSlide, CARD_SIZE, downloadCanvas, downloadAll } from './cardnews.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let state = loadState();
let current = state.lastGenerated || null;
let activeView = 'dashboard';
let activeTab = 'reels';
let queueFilter = 'all';
let multiPack = null;

const VIEW_META = {
  dashboard: ['대시보드', '오늘의 발행 계획과 수익 목표를 한눈에 봅니다.'],
  studio: ['생성 스튜디오', '소스 하나로 쇼츠·카드뉴스·블로그·SNS를 한 번에 만듭니다.'],
  cardnews: ['카드뉴스', '1080×1080 슬라이드를 확인하고 PNG로 저장합니다.'],
  queue: ['스케줄 · 큐', '하루 1~24회 타임테이블과 발행 승인을 관리합니다.'],
  channels: ['채널 관리', '9개 채널의 포맷·API·발행 한도를 확인합니다.'],
  goals: ['수익 목표', '9가지 수익 목표의 배분과 문구 구조를 조정합니다.'],
};

/* ------------------------------------------------------------------ */
/* 공통                                                                */
/* ------------------------------------------------------------------ */

function persist() {
  state.lastGenerated = current;
  saveState(state);
}

function toast(message, kind = '') {
  const stack = $('#toastStack');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, 3000);
}

async function copyText(text) {
  if (!text) return toast('복사할 내용이 없습니다.', 'warn');
  try {
    await navigator.clipboard.writeText(text);
    toast('클립보드에 복사했습니다.', 'ok');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('클립보드에 복사했습니다.', 'ok');
    } catch {
      toast('복사가 차단되었습니다. 직접 선택해 주세요.', 'warn');
    }
    ta.remove();
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.settings.theme === 'dark' ? '#080b14' : '#f4f6fc');
}

function aiLabel() {
  const p = state.settings.provider;
  if (p === 'preview') return { text: '프리뷰 템플릿', live: false };
  const key = state.settings.keys[p];
  if (!key) return { text: '프리뷰 템플릿', live: false };
  return { text: `AI 모드 · ${API_PROVIDERS.find((x) => x.id === p)?.name || p}`, live: true };
}

function connectedChannels() {
  return CHANNELS.filter((c) => state.connections[c.id]?.connected).map((c) => c.id);
}

function publishChannelIds() {
  return (state.publishChannels || []).filter((id) => getChannel(id));
}

/* ------------------------------------------------------------------ */
/* 내비게이션                                                          */
/* ------------------------------------------------------------------ */

function setView(view) {
  if (!VIEW_META[view]) view = 'dashboard';
  activeView = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.mnav').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const [title, sub] = VIEW_META[view];
  $('#viewTitle').textContent = title;
  $('#viewSub').textContent = sub;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'cardnews') drawCards();
}

/* ------------------------------------------------------------------ */
/* 대시보드                                                            */
/* ------------------------------------------------------------------ */

function renderFrequencyChips(container, onChange) {
  container.innerHTML = FREQUENCIES.map(
    (f) =>
      `<button type="button" class="chip ${Number(state.perDay) === f.perDay ? 'active' : ''}" data-freq="${f.perDay}">${f.perDay}회 <small>/일</small></button>`
  ).join('');
  $$('[data-freq]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.perDay = Number(btn.dataset.freq);
      persist();
      onChange();
    });
  });
}

function renderModes() {
  const mode = state.settings.mode;
  $$('#modeSegmented [data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $$('#queueModeSegmented [data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#modeHint').textContent =
    mode === 'auto'
      ? 'API 지원 채널은 승인 없이 발행 대기로 넘어갑니다.'
      : '생성만 자동, 발행은 승인 후 진행합니다.';
  $('#sideMode').textContent = mode === 'auto' ? '자동' : '반자동';
}

function renderDashboard() {
  const today = dateKey();
  const todays = queueForDate(state.queue, today);
  const summary = summarizeQueue(state.queue);
  const freq = Number(state.perDay) || 4;

  $('#heroDate').textContent = today.replace(/-/g, '.');
  $('#heroFreq').textContent = freq;
  $('#heroChannels').textContent = publishChannelIds().length || CHANNELS.length;

  $('#kpiToday').textContent = todays.length || freq;
  $('#kpiTodayFoot').textContent = todays.length ? `슬롯 ${freq}개 중 ${todays.length}개 등록` : `슬롯 ${freq}개 대기`;
  $('#kpiPending').textContent = summary.pending;
  $('#kpiPublished').textContent = summary.published;
  const conn = connectedChannels();
  $('#kpiChannels').innerHTML = `${conn.length}<span class="kpi-unit">/9</span>`;
  $('#kpiChannelsFoot').textContent = `API 연동 ${CHANNELS.filter((c) => state.connections[c.id]?.connected && c.apiSupported).length}곳`;

  // 타임라인
  const list = $('#timelineList');
  const timeline = buildTimeline(freq, publishChannelIds(), today);
  const byTime = new Map(todays.map((q) => [q.scheduledAt.slice(11, 16), q]));
  list.innerHTML = timeline
    .map((slot) => {
      const item = byTime.get(slot.time);
      const channel = getChannel(item?.channelId || slot.channelId);
      const format = getFormat(item?.formatId || slot.formatId);
      const status = item ? item.status : 'planned';
      const label = { planned: '예정', pending: '대기', approved: '승인', published: '발행', skipped: '건너뜀' }[status] || status;
      return `<li class="tl-item">
        <span class="tl-time">${slot.time}</span>
        <span class="tl-dot" style="background:${channel?.color || 'var(--accent)'}"></span>
        <span class="tl-main">
          <span class="tl-title">${escapeHtml(item ? item.title : `${channel?.name || ''} · ${format?.name || ''} 생성 예정`)}</span>
          <span class="tl-sub">${escapeHtml(channel?.name || '')} · ${escapeHtml(format?.name || '')} · ${item ? escapeHtml(item.goalName) : '콘텐츠 미생성'}</span>
        </span>
        <span class="tl-status ${status}">${label}</span>
      </li>`;
    })
    .join('');

  // 목표 믹스
  const mix = normalizeMix(state.goalMix);
  const mixRows = Object.entries(mix)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, val]) => {
      const g = getGoal(id);
      return `<div class="mix-row">
        <span class="mix-name">${g?.icon || ''} ${escapeHtml(g?.name || id)}</span>
        <span class="mix-bar"><span class="mix-fill" style="width:${Math.min(100, val)}%;background:linear-gradient(90deg, ${g?.color || '#7c8cff'}, var(--accent-2))"></span></span>
        <span class="mix-val">${val}%</span>
      </div>`;
    })
    .join('');
  $('#mixList').innerHTML = mixRows;

  // 다음 미리보기
  if (current) {
    const c = current;
    $('#nextPreview').innerHTML = `<div class="preview-card">
      <span class="muted">${escapeHtml(c.meta.channelName)} · ${escapeHtml(c.meta.formatName)} · ${escapeHtml(c.meta.goalName)}</span>
      <strong>${escapeHtml(c.title)}</strong>
      <span>${escapeHtml(c.hook)}</span>
    </div>`;
    $('#previewMeta').textContent = `${c.meta.mode === 'ai' ? 'AI 생성' : '프리뷰'} · ${c.meta.tone}`;
  }

  // 채널 미니
  const SHOW = 5;
  const mini = CHANNELS.slice(0, SHOW).map((ch) => {
    const on = state.connections[ch.id]?.connected;
    return `<li><span class="dot ${on ? 'on' : ''}"></span><span class="cm-name">${ch.icon} ${escapeHtml(ch.name)}</span><span class="small-tag">${ch.apiSupported ? 'API' : '복사'}</span></li>`;
  });
  if (CHANNELS.length > SHOW) {
    mini.push(`<li><span class="dot"></span><span class="cm-name muted">외 ${CHANNELS.length - SHOW}개 채널</span><span class="small-tag">전체 보기</span></li>`);
  }
  $('#channelMini').innerHTML = mini.join('');

  $('#todayPill').textContent = `오늘 ${todays.filter((q) => q.status === 'published').length}/${todays.length || freq}`;
  $('#navQueueBadge').textContent = summary.pending + summary.approved;

  const ai = aiLabel();
  $('#aiModePill').textContent = ai.text;
  $('#aiModePill').classList.toggle('is-live', ai.live);
  $('#sideAiMode').textContent = ai.live ? 'AI 연결' : '프리뷰 템플릿';
}

/* ------------------------------------------------------------------ */
/* 스튜디오                                                            */
/* ------------------------------------------------------------------ */

function renderSources() {
  const grid = $('#sourceGrid');
  grid.innerHTML = SOURCES.map((s) => {
    const active = state.sourceId === s.id;
    const goalOk = s.goals.includes('all') || s.goals.includes(state.focusGoal);
    return `<button type="button" class="source-btn ${active ? 'active' : ''}" data-source="${s.id}" title="${escapeHtml(s.hint)}">
      <span class="ico">${s.icon}</span>
      <span class="txt"><strong>${escapeHtml(s.name)}</strong><small>${s.kind === 'affiliate' ? '제휴 · 수수료' : s.kind === 'traffic' ? '조회수 · 트래픽' : s.kind === 'site' ? '내 사이트' : '키워드 생성'}${goalOk ? '' : ' · 목표 변경 권장'}</small></span>
    </button>`;
  }).join('');
  $$('[data-source]', grid).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.sourceId = btn.dataset.source;
      const src = getSource(state.sourceId);
      $('#keywordLabel').textContent = src?.kind === 'affiliate' ? '상품명 · 브랜드' : src?.kind === 'site' ? '페이지 주제' : '키워드 · 주제';
      persist();
      renderSources();
      renderSourceHint();
    });
  });
  renderSourceHint();
}

function renderSourceHint() {
  const src = getSource(state.sourceId);
  $('#sourceHint').textContent = src ? `💡 ${src.hint}` : '';
  if (src?.kind === 'affiliate') $('#disclosureToggle').checked = Boolean(state.settings.disclosure);
}

function renderGoalPicker() {
  const grid = $('#goalGrid');
  grid.innerHTML = GOALS.map((g) => {
    const active = state.focusGoal === g.id;
    return `<button type="button" class="goal-btn ${active ? 'active' : ''}" data-goal="${g.id}">
      <span class="top"><span class="ico">${g.icon}</span><strong>${escapeHtml(g.name)}</strong></span>
      <small>${escapeHtml(g.sub)}</small>
    </button>`;
  }).join('');
  $$('[data-goal]', grid).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.focusGoal = btn.dataset.goal;
      persist();
      renderGoalPicker();
      renderSources();
      renderStudioSummary();
    });
  });
}

function renderChannelPicker() {
  const wrap = $('#channelPick');
  wrap.innerHTML = CHANNELS.map(
    (c) =>
      `<button type="button" class="channel-btn ${state.channel === c.id ? 'active' : ''}" data-channel="${c.id}">
        <span class="ico">${c.icon}</span><span class="txt"><strong>${escapeHtml(c.name)}</strong></span>
      </button>`
  ).join('');
  $$('[data-channel]', wrap).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.channel = btn.dataset.channel;
      const ch = getChannel(state.channel);
      if (!ch.formats.includes(state.format)) state.format = ch.formats[0];
      persist();
      renderChannelPicker();
      renderFormatPicker();
      renderStudioSummary();
    });
  });
}

function renderFormatPicker() {
  const ch = getChannel(state.channel);
  const available = FORMATS.filter((f) => ch.formats.includes(f.id));
  if (!available.some((f) => f.id === state.format)) state.format = available[0].id;
  $('#formatPick').innerHTML = available
    .map(
      (f) => `<button type="button" class="format-btn ${state.format === f.id ? 'active' : ''}" data-format="${f.id}">
        <span class="ico">${f.icon}</span><span class="txt"><strong>${escapeHtml(f.name)}</strong><small>${escapeHtml(f.desc)}</small></span>
      </button>`
    )
    .join('');
  $$('[data-format]', $('#formatPick')).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.format = btn.dataset.format;
      persist();
      renderFormatPicker();
      renderStudioSummary();
    });
  });
}

function renderToneRow() {
  $('#toneRow').innerHTML = TONES.map(
    (t) => `<button type="button" class="tone-btn ${state.settings.tone === t.id ? 'active' : ''}" data-tone="${t.id}">
      <strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.desc)}</small></button>`
  ).join('');
  $$('[data-tone]').forEach((btn) => {
    if (btn.dataset.tone === undefined) return;
    btn.addEventListener('click', () => {
      state.settings.tone = btn.dataset.tone;
      persist();
      renderToneRow();
    });
  });
}

function renderStudioSummary() {
  const ai = aiLabel();
  $('#genHint').textContent =
    state.settings.provider === 'preview'
      ? '프리뷰 모드 — AI 키를 넣으면 같은 구조로 실제 문장을 생성합니다.'
      : ai.live
        ? `${ai.text} 모드 — 생성 실패 시 프리뷰 템플릿으로 자동 대체합니다.`
        : '키가 비어 있어 프리뷰 템플릿으로 생성합니다.';
}

function renderStudio() {
  renderSources();
  renderGoalPicker();
  renderChannelPicker();
  renderFormatPicker();
  renderToneRow();
  $('#disclosureToggle').checked = Boolean(state.settings.disclosure);
  $('#keywordInput').value = state.keyword || '';
  $('#linkInput').value = state.link || '';
  renderStudioSummary();
  renderResult();
}

/* ------------------------------------------------------------------ */
/* 생성                                                                */
/* ------------------------------------------------------------------ */

function buildPrompt(preview, opts) {
  const schema = `{
  "title": "제목",
  "hook": "첫 문장 훅",
  "keyPoints": ["핵심1","핵심2","핵심3"],
  "shorts": {"hook3s":"3초 훅","scenes":[{"time":"0-3초","scene":"훅","visual":"화면","narration":"나레이션","caption":"자막"}],"caption":"캡션","thumbnailText":"썸네일 문구"},
  "cardnews": {"title":"표지 제목","slides":[{"kicker":"라벨","headline":"한 줄","body":"설명"}]},
  "blog": {"title":"SEO 제목","metaDescription":"메타 설명","html":"<p>...</p>","faq":[{"q":"질문","a":"답"}]},
  "sns": {"x":["트윗1","트윗2"],"threads":"스레드 본문","facebook":"페이스북 본문"}
}`;
  return `당신은 한국어 SNS 콘텐츠 편집자입니다. 아래 조건으로 실제 발행 가능한 콘텐츠를 JSON 하나로만 출력하세요.
- 주제: ${opts.topic}
- 수익 목표: ${getGoal(opts.goalId)?.name} (${getGoal(opts.goalId)?.hook})
- 소스: ${getSource(opts.sourceId)?.name}
- 채널: ${getChannel(opts.channelId)?.name}
- 톤: ${TONES.find((t) => t.id === opts.tone)?.name}
- 링크: ${opts.link || '없음'}
- 카드뉴스는 최대 8장, 각 슬라이드는 headline 20자 내외·body 60자 내외.
- X 트윗은 각각 280자 이내. 과장·허위 수치 금지. 사실 확인이 안 된 숫자는 쓰지 마세요.
- 공정위 문구 ${opts.disclosure ? '포함' : '미포함'}.
- JSON 외 다른 텍스트, 코드펜스 금지.
스키마: ${schema}`;
}

function parseAIJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function mergeAI(preview, data) {
  if (!data) return preview;
  const merged = JSON.parse(JSON.stringify(preview));
  if (data.title) merged.title = String(data.title).slice(0, 120);
  if (data.hook) merged.hook = String(data.hook).slice(0, 160);
  if (Array.isArray(data.keyPoints) && data.keyPoints.length) {
    merged.keyPoints = data.keyPoints.slice(0, 4).map((p) => String(p).slice(0, 60));
    merged.summary = merged.keyPoints.map((p, i) => `${i + 1}. ${p}`).join(' / ');
  }
  if (data.shorts) {
    merged.shorts = { ...merged.shorts, ...data.shorts };
    if (Array.isArray(data.shorts.scenes)) {
      merged.shorts.scenes = data.shorts.scenes.slice(0, 8).map((s) => ({
        time: String(s.time || ''),
        scene: String(s.scene || ''),
        visual: String(s.visual || ''),
        narration: String(s.narration || ''),
        caption: String(s.caption || ''),
      }));
    }
  }
  if (data.cardnews?.slides?.length) {
    merged.cardnews = {
      ...merged.cardnews,
      title: data.cardnews.title || merged.cardnews.title,
      slides: data.cardnews.slides.slice(0, 8).map((s) => ({
        kicker: String(s.kicker || '').slice(0, 14),
        headline: String(s.headline || '').slice(0, 60),
        body: String(s.body || '').slice(0, 140),
      })),
    };
  }
  if (data.blog) {
    merged.blog = {
      ...merged.blog,
      title: data.blog.title || merged.blog.title,
      metaDescription: data.blog.metaDescription || merged.blog.metaDescription,
      html: data.blog.html || merged.blog.html,
      faq: Array.isArray(data.blog.faq) ? data.blog.faq.slice(0, 5) : merged.blog.faq,
    };
  }
  if (data.sns) {
    merged.sns = { ...merged.sns, ...data.sns };
    if (Array.isArray(data.sns.x)) merged.sns.x = data.sns.x.map((t) => truncateChars(String(t), 280)).slice(0, 8);
  }
  merged.meta.mode = 'ai';
  return merged;
}

async function callAI(preview, opts) {
  const provider = state.settings.provider;
  const apiKey = state.settings.keys[provider];
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey, prompt: buildPrompt(preview, opts) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || `생성 실패 (HTTP ${res.status})`);
  const parsed = parseAIJson(json.text);
  if (!parsed) throw new Error('AI 응답을 JSON으로 해석하지 못했습니다.');
  return mergeAI(preview, parsed);
}

function collectOpts() {
  return {
    topic: ($('#keywordInput').value || '').trim(),
    sourceId: state.sourceId,
    goalId: state.focusGoal,
    channelId: state.channel,
    formatId: state.format,
    link: ($('#linkInput').value || '').trim(),
    disclosure: $('#disclosureToggle').checked,
    tone: state.settings.tone,
    seed: (state.counter = (state.counter || 0) + 1),
  };
}

async function doGenerate({ silent = false } = {}) {
  const opts = collectOpts();
  state.keyword = opts.topic;
  state.link = opts.link;
  persist();
  const btn = $('#generateBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '생성 중…';
  try {
    let content = generateContent({ ...opts, mode: 'preview' });
    const provider = state.settings.provider;
    if (provider !== 'preview' && state.settings.keys[provider]) {
      try {
        content = await callAI(content, opts);
        if (!silent) toast('AI로 콘텐츠를 생성했습니다.', 'ok');
      } catch (err) {
        toast(`AI 생성 실패 → 프리뷰로 대체했습니다. (${err.message})`, 'warn');
      }
    } else if (!silent) {
      toast('4종 콘텐츠를 생성했습니다.', 'ok');
    }
    current = content;
    activeTab = ['reels', 'cardnews', 'blog', 'sns'].includes(content.meta.formatId) ? content.meta.formatId : 'reels';
    persist();
    renderResult();
    renderDashboard();
    if (!silent) setView('studio');
  } catch (err) {
    toast(`생성 실패: ${err.message}`, 'warn');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
  return current;
}

async function doPack() {
  const opts = collectOpts();
  const targets = CHANNELS.filter((c) => c.id === state.channel || state.connections[c.id]?.connected).map((c) => c.id);
  const ids = targets.length > 1 ? targets : CHANNELS.slice(0, 4).map((c) => c.id);
  multiPack = buildMultiChannelPack({ ...opts, mode: 'preview' }, ids);
  current = multiPack[0];
  activeTab = getFormat(current.meta.formatId)?.id === 'reels' ? 'reels' : current.meta.formatId;
  persist();
  renderResult();
  toast(`${multiPack.length}개 채널 패키지를 만들었습니다. 큐에 등록해 보세요.`, 'ok');
  setView('studio');
}

/* ------------------------------------------------------------------ */
/* 결과 렌더                                                            */
/* ------------------------------------------------------------------ */

function renderGuide() {
  const channelId = current?.meta.channelId || state.channel;
  const ch = getChannel(channelId);
  const guide = $('#publishGuide');
  if (!ch || !guide) return;
  $('#guideChannel').textContent = `${ch.icon} ${ch.name} · ${ch.limit}`;
  const steps = ch.apiSupported
    ? [
        `설정에서 <strong>${escapeHtml(ch.api.split('(')[0].trim())}</strong> 토큰을 등록합니다.`,
        '큐에서 <strong>승인</strong>을 누르면 예약 시각에 자동 발행됩니다.',
        '발행 결과는 큐의 <strong>발행 완료</strong> 상태와 웹훅으로 확인합니다.',
      ]
    : [
        '결과 화면에서 <strong>전체 복사</strong> 또는 항목별 복사를 누릅니다.',
        `${escapeHtml(ch.name)} 앱·에디터를 열고 새 글에 붙여넣습니다.`,
        '카드뉴스는 <strong>PNG 저장</strong>으로 이미지를 따로 올립니다.',
      ];
  $('#guideSteps').innerHTML = steps.map((t) => `<li>${t}</li>`).join('');
  $('#guideTip').textContent = `💡 ${ch.tip}`;
}

function renderResult() {
  const body = $('#resultBody');
  const emptyBox = $('#resultEmpty');
  renderGuide();
  if (!current) {
    body.hidden = true;
    emptyBox.hidden = false;
    $('#resultMode').textContent = '대기';
    return;
  }
  body.hidden = false;
  emptyBox.hidden = true;
  $('#resultMode').textContent = current.meta.mode === 'ai' ? 'AI 생성' : '프리뷰 템플릿';
  $('#resultMode').classList.toggle('is-live', current.meta.mode === 'ai');
  $('#resultTitle').textContent = current.title;
  $('#resultHook').textContent = current.hook;
  $('#resultTags').innerHTML = [
    current.meta.channelName,
    current.meta.formatName,
    current.meta.goalName,
    current.meta.sourceName,
    current.meta.apiSupported ? 'API 자동' : '복사 발행',
  ]
    .map((t, i) => `<span class="tag ${i === 0 ? 'hot' : ''}">${escapeHtml(t)}</span>`)
    .join('');

  const tabs = [
    ['reels', `쇼츠·릴스`],
    ['cardnews', `카드뉴스 ${current.cardnews.slides.length}장`],
    ['blog', '블로그'],
    ['sns', 'SNS'],
  ];
  $('#resultTabs').innerHTML = tabs
    .map(([id, label]) => `<button class="tab ${activeTab === id ? 'active' : ''}" data-tab="${id}" type="button">${escapeHtml(label)}</button>`)
    .join('');
  $$('#resultTabs [data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      activeTab = b.dataset.tab;
      renderResult();
    })
  );

  const panels = $('#tabPanels');
  if (activeTab === 'reels') {
    const s = current.shorts;
    panels.innerHTML = `<div class="script-block">
      <div class="copy-row"><strong style="font-size:12.5px">3초 훅 — ${escapeHtml(s.hook3s)}</strong><button class="btn btn-ghost btn-sm" data-copy="hook">복사</button></div>
      ${s.scenes.map((sc) => `<div class="scene">
        <span class="scene-time">${escapeHtml(sc.time)}</span>
        <span class="scene-body"><strong>${escapeHtml(sc.scene)} · ${escapeHtml(sc.visual)}</strong><p>${escapeHtml(sc.narration)}</p><small>자막: ${escapeHtml(sc.caption)}</small></span>
      </div>`).join('')}
      <div class="copy-row"><span class="muted">캡션 · ${escapeHtml(s.durationLabel)}</span><button class="btn btn-ghost btn-sm" data-copy="caption">캡션 복사</button></div>
      <div class="copy-area">${escapeHtml(s.caption)}</div>
    </div>`;
  } else if (activeTab === 'cardnews') {
    panels.innerHTML = `<div class="mini-list">
      ${current.cardnews.slides.map((s, i) => `<li><strong style="color:var(--text)">${String(i + 1).padStart(2, '0')}</strong> ${escapeHtml(s.headline)} <span class="muted">— ${escapeHtml(s.kicker)}</span></li>`).join('')}
    </div>
    <div class="copy-row" style="margin-top:10px"><span class="muted">최대 8장 · 1080×1080 PNG</span><button class="btn btn-ghost btn-sm" id="panelCardBtn" type="button">카드뉴스 화면에서 보기</button></div>
    <div class="copy-area" style="margin-top:8px">${escapeHtml(current.cardnews.caption)}</div>`;
    const btn = $('#panelCardBtn');
    if (btn) btn.addEventListener('click', () => setView('cardnews'));
  } else if (activeTab === 'blog') {
    const b = current.blog;
    panels.innerHTML = `<div class="copy-row"><strong style="font-size:12.5px">${escapeHtml(b.title)}</strong><button class="btn btn-ghost btn-sm" data-copy="bloghtml">HTML 복사</button></div>
      <div class="mini-list"><li>${escapeHtml(b.metaDescription)}</li>${(b.outline || []).map((o) => `<li><strong style="color:var(--text)">${escapeHtml(o.h2)}</strong> — ${escapeHtml(o.points.join(' / '))}</li>`).join('')}</div>
      <div class="copy-row" style="margin-top:10px"><span class="muted">본문 HTML (${b.wordCount}자)</span><button class="btn btn-ghost btn-sm" data-copy="blogtext">텍스트 복사</button></div>
      <div class="copy-area">${escapeHtml(b.html)}</div>`;
  } else {
    const s = current.sns;
    panels.innerHTML = `<div class="copy-row"><strong style="font-size:12.5px">X 스레드</strong><button class="btn btn-ghost btn-sm" data-copy="xthread">스레드 복사</button></div>
      <div class="mini-list">${s.x.map((t, i) => `<li>${i + 1}. ${escapeHtml(t)} <span class="muted">(${charCount(t)}자)</span></li>`).join('')}</div>
      <div class="copy-row" style="margin-top:10px"><strong style="font-size:12.5px">Threads</strong><button class="btn btn-ghost btn-sm" data-copy="threads">복사</button></div>
      <div class="copy-area">${escapeHtml(s.threads)}</div>
      <div class="copy-row" style="margin-top:8px"><strong style="font-size:12.5px">Facebook</strong><button class="btn btn-ghost btn-sm" data-copy="facebook">복사</button></div>`;
  }

  $$('[data-copy]', panels).forEach((btn) => {
    btn.addEventListener('click', () => {
      const map = {
        hook: current.shorts.hook3s,
        caption: current.shorts.caption,
        bloghtml: current.blog.html,
        blogtext: current.blog.text,
        xthread: current.sns.x.join('\n\n'),
        threads: current.sns.threads,
        facebook: current.sns.facebook,
      };
      copyText(map[btn.dataset.copy]);
    });
  });

  const note = $('#disclosureNote');
  if (current.disclosure) {
    note.hidden = false;
    note.textContent = `공정위 대가성 문구가 자동 삽입됩니다: “${current.disclosure}”`;
  } else {
    note.hidden = true;
  }
}

/* ------------------------------------------------------------------ */
/* 카드뉴스                                                            */
/* ------------------------------------------------------------------ */

function drawCards() {
  const grid = $('#cardGrid');
  const empty = $('#cardEmpty');
  if (!current) {
    grid.innerHTML = '';
    empty.hidden = false;
    $('#cardTitle').textContent = '카드뉴스 스튜디오';
    $('#cardSub').textContent = '1080×1080 · 최대 8장 · PNG 저장';
    return;
  }
  empty.hidden = true;
  const slides = current.cardnews.slides;
  $('#cardTitle').textContent = current.cardnews.title || current.title;
  $('#cardSub').textContent = `${slides.length}장 · 1080×1080 · ${current.meta.channelName} · ${current.meta.mode === 'ai' ? 'AI 생성' : '프리뷰'}`;
  grid.innerHTML = slides
    .map(
      (_, i) => `<div class="card-cell">
        <canvas class="card-canvas" data-slide="${i}" width="${CARD_SIZE}" height="${CARD_SIZE}"></canvas>
        <div class="card-meta"><span>${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}</span>
        <button class="btn btn-ghost btn-sm" data-download="${i}" type="button">PNG</button></div>
      </div>`
    )
    .join('');
  const accent = getGoal(current.meta.goalId)?.color || '#7c8cff';
  const theme = state.settings.theme;
  const brand = state.settings.brandName || 'SNS 오토파일럿';
  $$('.card-canvas', grid).forEach((canvas) => {
    const i = Number(canvas.dataset.slide);
    drawSlide(canvas.getContext('2d'), slides[i], { index: i, total: slides.length, accent, theme, brand });
  });
  $$('[data-download]', grid).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const i = Number(btn.dataset.download);
      const canvas = renderSlideCanvas(slides[i], { index: i, total: slides.length, accent, theme, brand });
      await downloadCanvas(canvas, `cardnews-${String(i + 1).padStart(2, '0')}.png`);
      toast(`${i + 1}장 PNG를 저장했습니다.`, 'ok');
    });
  });
}

/* ------------------------------------------------------------------ */
/* 큐                                                                  */
/* ------------------------------------------------------------------ */

function queueItemText(item) {
  const c = item.content;
  if (!c) return item.title;
  if (item.formatId === 'blog') return c.blog?.text || c.blog?.html || '';
  if (item.formatId === 'cardnews') return c.cardnews?.caption || '';
  if (item.formatId === 'reels') return c.shorts?.caption || '';
  return c.sns?.threads || c.sns?.single || '';
}

function renderQueue() {
  const summary = summarizeQueue(state.queue);
  $('#qTotal').textContent = summary.total;
  $('#qPending').textContent = summary.pending;
  $('#qApproved').textContent = summary.approved;
  $('#qPublished').textContent = summary.published;

  const list = $('#queueList');
  const items = [...state.queue]
    .filter((q) => queueFilter === 'all' || q.status === queueFilter)
    .sort((a, b) => String(b.scheduledAt).localeCompare(String(a.scheduledAt)));
  $('#queueEmpty').hidden = items.length > 0;
  list.innerHTML = items
    .map((q) => {
      const ch = getChannel(q.channelId);
      const d = String(q.scheduledAt);
      const statusLabel = { pending: '대기', approved: '승인', published: '발행', skipped: '건너뜀' }[q.status] || q.status;
      const actions = [];
      if (q.status === 'pending') actions.push(`<button class="btn btn-ghost btn-sm" data-act="approved" data-id="${q.id}">승인</button>`);
      if (q.status === 'approved') actions.push(`<button class="btn btn-ghost btn-sm" data-act="published" data-id="${q.id}">발행 처리</button>`);
      actions.push(`<button class="btn btn-ghost btn-sm" data-copy-id="${q.id}">복사</button>`);
      if (q.status === 'pending' || q.status === 'approved') actions.push(`<button class="btn btn-ghost btn-sm" data-act="skipped" data-id="${q.id}">건너뛰기</button>`);
      if (q.status === 'skipped') actions.push(`<button class="btn btn-ghost btn-sm" data-act="pending" data-id="${q.id}">되돌리기</button>`);
      actions.push(`<button class="btn btn-ghost btn-sm" data-open="${q.id}">보기</button>`);
      return `<li class="q-item">
        <div class="q-when"><span class="q-time">${escapeHtml(d.slice(11, 16))}</span><span class="q-date">${escapeHtml(d.slice(5, 10))}</span></div>
        <div class="q-main">
          <span class="q-title">${escapeHtml(q.title)}</span>
          <span class="q-meta">
            <span class="status-badge ${q.status}">${statusLabel}</span>
            <span class="tag">${ch?.icon || ''} ${escapeHtml(q.channelName)}</span>
            <span class="tag">${escapeHtml(q.formatName)}</span>
            <span class="tag">${escapeHtml(q.goalName)}</span>
            ${q.apiSupported ? '<span class="tag">API</span>' : '<span class="tag">복사 발행</span>'}
          </span>
        </div>
        <div class="q-actions">${actions.join('')}</div>
      </li>`;
    })
    .join('');

  $$('[data-act]', list).forEach((btn) =>
    btn.addEventListener('click', () => {
      state.queue = transitionQueue(state.queue, btn.dataset.id, btn.dataset.act);
      persist();
      renderQueue();
      renderDashboard();
      toast(btn.dataset.act === 'published' ? '발행 완료로 표시했습니다. 실제 게시는 복사해 붙여넣어 주세요.' : '큐 상태를 바꿨습니다.', 'ok');
    })
  );
  $$('[data-copy-id]', list).forEach((btn) =>
    btn.addEventListener('click', () => {
      const item = state.queue.find((q) => q.id === btn.dataset.copyId);
      if (!item) return;
      copyText(queueItemText(item));
    })
  );
  $$('[data-open]', list).forEach((btn) =>
    btn.addEventListener('click', () => {
      const item = state.queue.find((q) => q.id === btn.dataset.open);
      if (!item) return;
      current = item.content;
      activeTab = getFormat(item.formatId)?.id || 'sns';
      setView('studio');
      renderResult();
    })
  );

  renderQueueControls();
}

function renderQueueControls() {
  const chips = $('#queueFreqChips');
  renderFrequencyChips(chips, () => {
    renderQueueControls();
    renderDashboard();
  });
  const times = scheduleTimes(state.perDay);
  $('#queueTimeHint').textContent = `${times.length}회 · ${times.join(' · ')}`;
  $$('#queueFilters [data-filter]').forEach((b) => b.classList.toggle('active', b.dataset.filter === queueFilter));
  renderModes();
}

function fillToday() {
  const today = dateKey();
  const channels = publishChannelIds().length ? publishChannelIds() : ['instagram', 'threads', 'x', 'blogger'];
  const result = fillDayQueue(state.queue, {
    perDay: state.perDay,
    dateISO: today,
    channels,
    mode: state.settings.mode,
    buildContent: (slot) =>
      generateContent({
        topic: state.keyword,
        sourceId: state.sourceId,
        goalId: state.focusGoal,
        channelId: slot.channelId,
        formatId: slot.formatId,
        link: state.link,
        disclosure: state.settings.disclosure,
        tone: state.settings.tone,
        seed: (state.counter = (state.counter || 0) + 1),
        mode: 'preview',
      }),
  });
  state.queue = result.queue;
  if (result.added.length && !current) current = result.added[0].content;
  persist();
  renderAll();
  toast(
    result.added.length
      ? `오늘 ${result.added.length}개 슬롯을 큐에 채웠습니다.${result.skipped ? ` (이미 등록된 ${result.skipped}개는 건너뜀)` : ''}`
      : '오늘 슬롯이 이미 모두 채워져 있습니다.',
    result.added.length ? 'ok' : 'warn'
  );
}

/* ------------------------------------------------------------------ */
/* 채널                                                                */
/* ------------------------------------------------------------------ */

function renderChannels() {
  const grid = $('#channelGrid');
  grid.innerHTML = CHANNELS.map((c) => {
    const conn = state.connections[c.id];
    return `<article class="channel-card ${conn?.connected ? 'on' : ''}" style="--ch-color:${c.color}">
      <div class="cc-head">
        <span class="cc-icon">${c.icon}</span>
        <span class="cc-name"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.api)}</small></span>
        ${c.apiSupported ? '<span class="badge api">API</span>' : `<span class="badge">${escapeHtml(c.badge || '수동')}</span>`}
      </div>
      <div class="cc-formats">${c.formats.map((f) => `<span class="tag">${escapeHtml(getFormat(f)?.name || f)}</span>`).join('')}</div>
      <div class="field"><span>계정 / 핸들</span><input type="text" data-handle="${c.id}" value="${escapeHtml(conn?.handle || '')}" placeholder="@handle 또는 페이지 ID" maxlength="80" /></div>
      <div class="cc-foot">
        <label class="switch"><input type="checkbox" data-connect="${c.id}" ${conn?.connected ? 'checked' : ''} /><span>${conn?.connected ? '연결됨' : '연결 안 됨'}</span></label>
        <span class="small-tag">${escapeHtml(c.limit)}</span>
      </div>
    </article>`;
  }).join('');

  $$('[data-connect]', grid).forEach((input) =>
    input.addEventListener('change', () => {
      const id = input.dataset.connect;
      state.connections[id].connected = input.checked;
      persist();
      renderChannels();
      renderDashboard();
      toast(`${getChannel(id)?.name} 연결 상태를 ${input.checked ? '연결됨' : '연결 안 됨'}으로 저장했습니다.`, 'ok');
    })
  );
  $$('[data-handle]', grid).forEach((input) =>
    input.addEventListener('change', () => {
      state.connections[input.dataset.handle].handle = input.value.trim().slice(0, 80);
      persist();
      renderDashboard();
    })
  );

  $('#channelTable').innerHTML = CHANNELS.map(
    (c) => `<tr><td><strong>${c.icon} ${escapeHtml(c.name)}</strong></td>
      <td>${c.formats.map((f) => escapeHtml(getFormat(f)?.name || f)).join(', ')}</td>
      <td>${c.apiSupported ? '<span class="badge api">자동 발행</span>' : `<span class="badge">${escapeHtml(c.badge || '수동')}</span>`}</td>
      <td>${escapeHtml(c.limit)}</td><td>${escapeHtml(c.tip)}</td></tr>`
  ).join('');
}

/* ------------------------------------------------------------------ */
/* 수익 목표                                                           */
/* ------------------------------------------------------------------ */

function renderGoals() {
  const focus = getGoal(state.focusGoal);
  $('#focusGoalName').textContent = `${focus.icon} ${focus.name}`;
  $('#focusGoalKpi').textContent = `${focus.kpi} · ${focus.hook}`;

  $('#goalCardGrid').innerHTML = GOALS.map((g) => {
    const val = state.goalMix[g.id] ?? 0;
    return `<article class="goal-card ${state.focusGoal === g.id ? 'focus' : ''}" style="--ch-color:${g.color}">
      <div class="gc-head"><span class="gc-icon">${g.icon}</span>
        <span class="gc-name"><strong>${escapeHtml(g.name)}</strong><small>${escapeHtml(g.sub)}</small></span>
        <span class="gc-kpi">${escapeHtml(g.kpi)}</span></div>
      <div class="slider-row">
        <input type="range" min="0" max="60" step="1" value="${val}" data-mix="${g.id}" aria-label="${escapeHtml(g.name)} 비중" />
        <span class="slider-val" id="mix-${g.id}">${val}%</span>
      </div>
      <div class="gc-foot">
        <button class="btn btn-ghost btn-sm" data-focus-goal="${g.id}" type="button">${state.focusGoal === g.id ? '집중 중' : '집중 목표로'}</button>
        <span class="tag">${g.disclosure ? '대가성 문구' : '문구 없음'}</span>
      </div>
    </article>`;
  }).join('');

  $$('[data-mix]', $('#goalCardGrid')).forEach((input) =>
    input.addEventListener('input', () => {
      state.goalMix[input.dataset.mix] = Number(input.value);
      $(`#mix-${input.dataset.mix}`).textContent = `${input.value}%`;
    })
  );
  $$('[data-mix]', $('#goalCardGrid')).forEach((input) =>
    input.addEventListener('change', () => {
      state.goalMix = normalizeMix(state.goalMix);
      persist();
      renderGoals();
      renderDashboard();
    })
  );
  $$('[data-focus-goal]', $('#goalCardGrid')).forEach((btn) =>
    btn.addEventListener('click', () => {
      state.focusGoal = btn.dataset.focusGoal;
      persist();
      renderGoals();
      renderDashboard();
      renderGoalPicker();
    })
  );

  $('#goalTable').innerHTML = GOALS.map(
    (g) => `<tr><td><strong>${g.icon} ${escapeHtml(g.name)}</strong></td><td>${escapeHtml(g.hook)}</td>
      <td>${escapeHtml(g.cta)}</td><td>${escapeHtml(g.linkLabel)}</td><td>${escapeHtml(g.kpi)}</td></tr>`
  ).join('');
}

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */

function renderProviderOptions() {
  const sel = $('#providerSelect');
  const current = state.settings.provider;
  sel.innerHTML = [
    '<option value="preview">프리뷰 템플릿 (키 없이 테스트)</option>',
    ...API_PROVIDERS.map((p) => `<option value="${p.id}">${p.name} · ${p.model}</option>`),
  ].join('');
  sel.value = API_PROVIDERS.some((p) => p.id === current) ? current : 'preview';
}

function openSettings() {
  const s = state.settings;
  renderProviderOptions();
  $('#providerSelect').value = s.provider === 'preview' ? 'preview' : s.provider;
  $('#apiKeyInput').value = s.provider === 'preview' ? '' : s.keys[s.provider] || '';
  $('#brandInput').value = s.brandName || '';
  $('#webhookInput').value = s.webhook || '';
  $('#cfgBlogger').value = s.integrations?.blogger || '';
  $('#cfgX').value = s.integrations?.x || '';
  $('#cfgMeta').value = s.integrations?.meta || '';
  $('#cfgVideo').value = s.integrations?.video || '';
  $('#appVersion').textContent = APP.version;
  $('#appQueueCount').textContent = `${state.queue.length}개`;
  $('#appAiMode').textContent = aiLabel().text;
  $('#keyStatus').textContent = aiLabel().live ? '키 저장됨 · 연결 테스트로 확인하세요' : '프리뷰 템플릿 모드';
  $('#settingsDialog').showModal();
}

function saveSettings() {
  const provider = $('#providerSelect').value;
  state.settings.provider = provider;
  if (provider !== 'preview') {
    const key = $('#apiKeyInput').value.trim();
    if (key) state.settings.keys[provider] = key;
    else delete state.settings.keys[provider];
  }
  state.settings.brandName = $('#brandInput').value.trim().slice(0, 30) || '한일 님';
  state.settings.webhook = $('#webhookInput').value.trim();
  state.settings.integrations = {
    blogger: $('#cfgBlogger').value.trim(),
    x: $('#cfgX').value.trim(),
    meta: $('#cfgMeta').value.trim(),
    video: $('#cfgVideo').value.trim(),
  };
  persist();
  renderDashboard();
  renderStudioSummary();
  toast('설정을 저장했습니다.', 'ok');
}

async function testKey() {
  const provider = $('#providerSelect').value;
  const apiKey = $('#apiKeyInput').value.trim() || state.settings.keys[provider];
  if (provider === 'preview') return toast('프리뷰 모드는 키가 필요 없습니다.', 'warn');
  if (!apiKey) return toast('API 키를 먼저 입력해 주세요.', 'warn');
  $('#keyStatus').textContent = '테스트 중…';
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey, prompt: '한국어로 "연결됨"이라고만 답하세요.' }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      $('#keyStatus').textContent = `연결 성공 · ${truncateChars(String(json.text || '').trim(), 40)}`;
      toast('AI 연결에 성공했습니다.', 'ok');
    } else {
      $('#keyStatus').textContent = `실패: ${json.error || res.status}`;
      toast(`연결 실패: ${json.error || res.status}`, 'warn');
    }
  } catch (err) {
    $('#keyStatus').textContent = `실패: ${err.message}`;
  }
}

/* ------------------------------------------------------------------ */
/* 이벤트 바인딩                                                       */
/* ------------------------------------------------------------------ */

function bind() {
  $$('[data-view]').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
  $$('[data-view-link]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setView(btn.dataset.viewLink);
    })
  );

  $('#themeBtn').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    persist();
    if (activeView === 'cardnews') drawCards();
    toast(state.settings.theme === 'dark' ? '다크 모드' : '라이트 모드');
  });

  $('#settingsBtn').addEventListener('click', openSettings);
  $('#openSettingsBtn').addEventListener('click', openSettings);
  $('#settingsForm').addEventListener('submit', (e) => {
    const submitter = e.submitter;
    if (submitter && submitter.value === 'close') return;
    e.preventDefault();
    saveSettings();
    $('#settingsDialog').close();
  });
  $('#testKeyBtn').addEventListener('click', (e) => {
    e.preventDefault();
    testKey();
  });
  $('#providerSelect').addEventListener('change', () => {
    const p = $('#providerSelect').value;
    $('#apiKeyInput').value = p === 'preview' ? '' : state.settings.keys[p] || '';
  });
  $('#settingsResetBtn').addEventListener('click', (e) => {
    e.preventDefault();
    if (!window.confirm('저장된 큐와 설정을 모두 지우고 초기화할까요?')) return;
    state = resetState();
    current = null;
    applyTheme();
    renderAll();
    $('#settingsDialog').close();
    toast('초기화했습니다.', 'ok');
  });
  $('#settingsExportBtn').addEventListener('click', (e) => {
    e.preventDefault();
    downloadText('sns-autopilot-state.json', exportJSON(state));
  });

  $('#modeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    state.settings.mode = btn.dataset.mode;
    persist();
    renderModes();
  });
  $('#queueModeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    state.settings.mode = btn.dataset.mode;
    persist();
    renderModes();
  });

  $('#keywordInput').addEventListener('input', (e) => {
    state.keyword = e.target.value;
    persist();
  });
  $('#linkInput').addEventListener('input', (e) => {
    state.link = e.target.value;
    persist();
  });
  $('#disclosureToggle').addEventListener('change', (e) => {
    state.settings.disclosure = e.target.checked;
    persist();
  });

  $('#generateBtn').addEventListener('click', () => doGenerate());
  $('#packBtn').addEventListener('click', doPack);
  $('#heroGenerateBtn').addEventListener('click', async () => {
    const content = await doGenerate({ silent: true });
    if (!content) return;
    const slot = nextSlot(state.perDay);
    const day = dateKey(new Date(Date.now() + slot.dayOffset * 86400000));
    const item = makeQueueItem(content, { scheduledAt: `${day}T${slot.time}:00` });
    state.queue.push(item);
    persist();
    renderAll();
    toast(`${slot.dayOffset ? '내일' : '오늘'} ${slot.time} 슬롯에 등록했습니다.`, 'ok');
    setView('queue');
  });

  $('#addQueueBtn').addEventListener('click', () => {
    if (!current) return;
    const slot = nextSlot(state.perDay);
    const day = dateKey(new Date(Date.now() + slot.dayOffset * 86400000));
    const item = makeQueueItem(current, { scheduledAt: `${day}T${slot.time}:00` });
    state.queue.push(item);
    if (multiPack && multiPack.length > 1) {
      multiPack.slice(1).forEach((c) => state.queue.push(makeQueueItem(c, { scheduledAt: `${day}T${slot.time}:00` })));
    }
    persist();
    renderAll();
    toast(`${multiPack?.length > 1 ? multiPack.length + '개 채널이' : '큐에'} 등록되었습니다 (${day} ${slot.time}).`, 'ok');
  });

  $('#openCardsBtn').addEventListener('click', () => setView('cardnews'));
  $('#copyAllBtn').addEventListener('click', () => {
    if (!current) return;
    const text = [current.title, current.hook, current.blog.text, current.sns.threads, current.disclosure || ''].join('\n\n');
    copyText(text);
  });

  $('#downloadAllBtn').addEventListener('click', async () => {
    if (!current) return toast('생성된 카드뉴스가 없습니다.', 'warn');
    const accent = getGoal(current.meta.goalId)?.color || '#7c8cff';
    await downloadAll(current.cardnews, { accent, theme: state.settings.theme, brand: state.settings.brandName || 'SNS 오토파일럿' });
    toast(`${current.cardnews.slides.length}장 PNG를 저장했습니다.`, 'ok');
  });
  $('#copyCaptionBtn').addEventListener('click', () => current && copyText(current.cardnews.caption));

  $('#fillDayBtn').addEventListener('click', fillToday);
  $('#exportBtn').addEventListener('click', () => {
    downloadText(`sns-autopilot-${dateKey()}.json`, exportJSON(state));
    toast('JSON을 내보냈습니다.', 'ok');
  });
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importJSON(text);
    if (!result.ok) {
      toast(`불러오기 실패: ${result.error}`, 'warn');
      e.target.value = '';
      return;
    }
    state = result.state;
    current = state.lastGenerated || null;
    applyTheme();
    renderAll();
    toast(`큐 ${state.queue.length}건을 불러왔습니다.`, 'ok');
    e.target.value = '';
  });

  $('#queueFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    queueFilter = btn.dataset.filter;
    renderQueue();
  });
  $('#approveAllBtn').addEventListener('click', () => {
    let n = 0;
    state.queue = state.queue.map((q) => {
      if (q.status === 'pending') {
        n += 1;
        return { ...q, status: 'approved' };
      }
      return q;
    });
    persist();
    renderAll();
    toast(`${n}건을 승인했습니다.`, n ? 'ok' : 'warn');
  });
  $('#clearQueueBtn').addEventListener('click', () => {
    if (!state.queue.length) return toast('큐가 이미 비어 있습니다.', 'warn');
    if (!window.confirm('큐를 모두 비울까요? 되돌릴 수 없습니다.')) return;
    state.queue = [];
    persist();
    renderAll();
    toast('큐를 비웠습니다.');
  });

  $('#settingsDialog').addEventListener('click', (e) => {
    if (e.target === $('#settingsDialog')) $('#settingsDialog').close();
  });
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ------------------------------------------------------------------ */
/* 초기화                                                              */
/* ------------------------------------------------------------------ */

function renderAll() {
  renderDashboard();
  renderStudio();
  renderQueue();
  renderChannels();
  renderGoals();
  renderModes();
  drawCards();
}

function init() {
  applyTheme();
  renderFrequencyChips($('#freqChips'), () => {
    renderQueueControls();
    renderDashboard();
  });
  bind();
  renderAll();
  setView('dashboard');
  if (!state.queue.length) {
    // 첫 방문: 오늘 날짜 타임라인만 미리 보여 줍니다.
    renderDashboard();
  }
}

init();

window.__snsAutopilot = { get state() { return state; }, generate: doGenerate };
