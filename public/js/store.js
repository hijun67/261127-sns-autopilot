// 상태 저장소 — localStorage 영속화 · JSON 내보내기/불러오기
// 브라우저에서는 localStorage, 테스트에서는 주입한 가짜 스토리지를 씁니다.

import { APP, CHANNELS, defaultState, DEFAULT_GOAL_MIX } from './data.js';

export const MAX_QUEUE = 500;

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 저장된 상태를 기본값과 병합 (누락 필드 보강, 잘못된 값 방어) */
export function mergeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const settings = { ...base.settings, ...(raw.settings || {}) };
  settings.keys = { ...base.settings.keys, ...(raw.settings?.keys || {}) };
  settings.mode = settings.mode === 'auto' ? 'auto' : 'semi';
  settings.theme = settings.theme === 'light' ? 'light' : 'dark';

  const connections = { ...base.connections };
  for (const ch of CHANNELS) {
    const saved = raw.connections?.[ch.id];
    connections[ch.id] = {
      connected: Boolean(saved?.connected),
      handle: typeof saved?.handle === 'string' ? saved.handle.slice(0, 80) : '',
    };
  }

  const queue = Array.isArray(raw.queue)
    ? raw.queue
        .filter((q) => q && typeof q === 'object' && q.id && q.content)
        .slice(-MAX_QUEUE)
    : [];

  const publishChannels = Array.isArray(raw.publishChannels)
    ? raw.publishChannels.filter((id) => CHANNELS.some((c) => c.id === id))
    : base.publishChannels;

  return {
    ...base,
    ...raw,
    version: 1,
    settings,
    connections,
    queue,
    perDay: [1, 2, 4, 6, 12, 24].includes(Number(raw.perDay)) ? Number(raw.perDay) : 4,
    publishChannels: publishChannels.length ? publishChannels : base.publishChannels,
    counter: Number.isFinite(raw.counter) ? raw.counter : 0,
    goalMix: { ...DEFAULT_GOAL_MIX, ...(raw.goalMix || {}) },
    lastGenerated: raw.lastGenerated && typeof raw.lastGenerated === 'object' ? raw.lastGenerated : null,
  };
}

export function loadState(storage = globalThis.localStorage) {
  if (!storage) return defaultState();
  const raw = safeParse(storage.getItem(APP.storageKey) || '');
  return mergeState(raw);
}

export function saveState(state, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    const trimmed = { ...state, queue: (state.queue || []).slice(-MAX_QUEUE) };
    storage.setItem(APP.storageKey, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}

export function resetState(storage = globalThis.localStorage) {
  if (storage) storage.removeItem(APP.storageKey);
  return defaultState();
}

/** 내보내기용 JSON — 사람이 읽을 수 있게 정렬 */
export function exportJSON(state) {
  return JSON.stringify({ app: APP.name, exportedAt: new Date().toISOString(), state }, null, 2);
}

/**
 * 불러오기. 다른 앱/깨진 파일을 조용히 삼키지 않고 이유를 돌려줍니다.
 * @returns {{ok:boolean, state?:object, error?:string}}
 */
export function importJSON(text) {
  const parsed = safeParse(text);
  if (!parsed) return { ok: false, error: 'JSON 형식이 아닙니다.' };
  const candidate = parsed.state || parsed;
  if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.queue) && !candidate.settings) {
    return { ok: false, error: 'SNS 오토파일럿 백업 파일이 아닙니다.' };
  }
  if (parsed.app && parsed.app !== APP.name) {
    return { ok: false, error: `다른 앱의 백업입니다: ${parsed.app}` };
  }
  return { ok: true, state: mergeState(candidate) };
}

/** 목표 믹스 정규화 (합계 100) */
export function normalizeMix(mix) {
  const entries = Object.entries(mix).filter(([, v]) => Number(v) > 0);
  const sum = entries.reduce((acc, [, v]) => acc + Number(v), 0);
  if (!sum) return { ...DEFAULT_GOAL_MIX };
  const out = {};
  let rest = 100;
  entries.forEach(([k, v], i) => {
    const value = i === entries.length - 1 ? rest : Math.round((Number(v) / sum) * 100);
    out[k] = Math.max(0, value);
    rest -= out[k];
  });
  return out;
}
