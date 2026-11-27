# 브랜드 표기 기본값 `한일 님` → `코네스` (v1.0.3) — 2026-11-28

이전 E2E 보고서(`e2e-report-2026-11-28.md`, `fix-report-2026-11-28.md`)에서 범위 밖(H~M)으로 남겨 두었던
**브랜드 표기 기본값이 개인 이름(`한일 님`)으로 박히는 문제**를 정리한 작업입니다.

## 1. 바뀐 것

| 위치 | 이전 | 이후 |
|---|---|---|
| `public/js/data.js` `defaultState().settings.brandName` | `한일 님` | **`코네스`** |
| `public/js/app.js` 설정 저장(`saveSettings`) — 빈 값이면 | `한일 님` | **`코네스`** |
| `public/js/app.js` 카드뉴스 미리보기 렌더 fallback | `SNS 오토파일럿` | **`코네스`** |
| `public/js/app.js` 전체 PNG 저장 fallback | `SNS 오토파일럿` | **`코네스`** |
| `public/js/cardnews.js` `drawSlide()` 기본 파라미터 | `SNS 오토파일럿` | **`코네스`** |
| `public/js/store.js` `mergeState()` | 저장값 그대로(빈 문자열 유지) | **빈/공백/null이면 `코네스` 복원**, 옛 기본값 `한일 님`도 `코네스`로 이전, 사용자 값은 trim 후 30자 유지 |

부가: 버전 1.0.1 → **1.0.3**, `/app.css`·`/app.js` 캐시 버스터 `?v=1.0.3`.
(1.0.2 = 기본값 변경, 1.0.3 = 옛 저장값 이전 추가)

## 2. 테스트

`node --test tests/*.test.mjs` → **45/45 통과**.
`tests/core.test.mjs`에 1건 추가: 기본값 `코네스` / 빈·공백·null 저장값 복원 / 옛 기본값 `한일 님` → `코네스` 이전 / 사용자 입력값 유지(trim·30자) / 저장→불러오기 라운드트립.

## 3. 배포

- 커밋 `b4e8095`(v1.0.2), `f43129f`(v1.0.3) → `hijun67/261127-sns-autopilot` main 푸시
- Cloudflare Pages 최종 배포 `980e1f68-cf07-4464-976c-e54b888940ae` → 프로덕션 별칭 `https://sns-autopilot-bin.pages.dev`
  (이전 단계 배포 `163479e4-3071-4ba5-a935-bef88346b102` 는 v1.0.2)
- 배포용 임시 토큰은 **두 번에 걸쳐 각각 그 배포에만** 생성·사용·삭제:
  `tmp-sns-autopilot-brand-20261128`, `tmp-sns-autopilot-brand2-20261128`
  (둘 다 권한은 **계정.Cloudflare Pages:편집 1개**, 리소스는 Hijun67@gmail.com 계정 한정, 7일 만료)
  삭제 후 `GET /user/tokens/verify` **401**, `GET /accounts/…/pages/projects` **401** 확인.
  계정에 있던 `Instinct SNS autopost deploy`, `Instinct Workers deploy` 토큰은 생성·수정 시각 그대로이며 건드리지 않았습니다(현재 목록에 그 2개만 남음).

## 4. 라이브 검증 (Playwright, `scripts/verify_brand.py`)

`python3 scripts/verify_brand.py https://sns-autopilot-bin.pages.dev .tmp/verify-brand` → **ALL PASS**, 콘솔·페이지 에러 0건.

| 항목 | 결과 |
|---|---|
| 새 방문 기본값 | 설정 `브랜드 표기` 입력칸 **`코네스`**, 버전 **1.0.3** |
| 빈 값 저장 | `"   "`로 저장해도 `localStorage.settings.brandName` = **`코네스`**, 입력칸도 `코네스`로 복원 |
| 옛 값 이전 | 브라우저에 `한일 님`이 저장돼 있어도 새로 고치면 **`코네스`**로 복원 |
| 카드뉴스 하단 표기 | 미리보기 8장의 브랜드 영역 픽셀이 `코네스`로 그린 렌더와 **8/8 완전 일치**, 빈 값 렌더와는 842px 차이, 잉크량 726 vs 0 |
| PNG | `cardnews-01.png` 1,348,696 bytes 저장(1080×1080), 하단 좌측 `코네스` 육안 확인 |

증빙: `docs/screenshots/brand-cones-settings-1440.png`, `docs/screenshots/brand-cones-cardnews-view-1440.png`,
`docs/screenshots/brand-cones-cardnews-01.png`, 원자료 `docs/brand-verify-live-2026-11-28.json`.

## 5. 참고

- 사용자가 설정에서 **직접 다른 이름을 넣은 경우**는 그 값이 유지됩니다. 옛 기본값 `한일 님`만 새 기본값으로 옮깁니다.
