# 브랜드 표기 기본값 `한일 님` → `코네스` (v1.0.2) — 2026-11-28

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
| `public/js/store.js` `mergeState()` | 저장값 그대로(빈 문자열 유지) | **빈/공백/null이면 `코네스` 복원**, 사용자 값은 trim 후 30자 유지 |

부가: 버전 1.0.1 → **1.0.2**, `/app.css`·`/app.js` 캐시 버스터 `?v=1.0.2`.

## 2. 테스트

`node --test tests/*.test.mjs` → **45/45 통과**.
`tests/core.test.mjs`에 1건 추가: 기본값 `코네스` / 빈·공백·null 저장값 복원 / 사용자 입력값 유지(trim·30자) / 저장→불러오기 라운드트립.

## 3. 배포

- 커밋 `b4e8095` → `hijun67/261127-sns-autopilot` main 푸시
- Cloudflare Pages 배포 ID `163479e4-3071-4ba5-a935-bef88346b102` (프로덕션 별칭 `https://sns-autopilot-bin.pages.dev`)
- 배포용 임시 토큰 `tmp-sns-autopilot-brand-20261128`(계정.Cloudflare Pages:편집 1개, Hijun67 계정 한정, 7일 만료)만 생성·사용 후 **삭제**.
  삭제 후 `GET /user/tokens/verify` **401**, `GET /accounts/…/pages/projects` **401** 확인.
  계정에 있던 `Instinct SNS autopost deploy`, `Instinct Workers deploy` 토큰은 건드리지 않음.

## 4. 라이브 검증 (Playwright, `scripts/verify_brand.py`)

`python3 scripts/verify_brand.py https://sns-autopilot-bin.pages.dev .tmp/verify-brand` → **ALL PASS**, 콘솔·페이지 에러 0건.

| 항목 | 결과 |
|---|---|
| 새 방문 기본값 | 설정 `브랜드 표기` 입력칸 **`코네스`**, 버전 **1.0.2** |
| 빈 값 저장 | `"   "`로 저장해도 `localStorage.settings.brandName` = **`코네스`**, 입력칸도 `코네스`로 복원 |
| 카드뉴스 하단 표기 | 미리보기 8장의 브랜드 영역 픽셀이 `코네스`로 그린 렌더와 **8/8 완전 일치**, 빈 값 렌더와는 842px 차이, 잉크량 726 vs 0 |
| PNG | `cardnews-01.png` 1,348,696 bytes 저장(1080×1080), 하단 좌측 `코네스` 육안 확인 |

증빙: `docs/screenshots/brand-cones-settings-1440.png`, `docs/screenshots/brand-cones-cardnews-view-1440.png`,
`docs/screenshots/brand-cones-cardnews-01.png`, 원자료 `docs/brand-verify-live-2026-11-28.json`.

## 5. 남은 것

- 기존 방문자의 브라우저 `localStorage`에 이미 `한일 님`이 저장돼 있으면 그 값이 그대로 유지됩니다(사용자가 직접 바꾼 값이므로 덮어쓰지 않음).
  기본값으로 되돌리려면 설정에서 브랜드 표기를 비우고 저장하거나 `설정 초기화`를 누르면 됩니다.
