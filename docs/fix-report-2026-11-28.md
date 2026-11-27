# SNS 오토파일럿 v1.0.1 — E2E 결함 수정·재배포·재검증 (2026-11-28)

- 대상: https://sns-autopilot-bin.pages.dev (v1.0.1, 2026-11-28 00:47 KST 배포)
- 수정 근거: [`e2e-report-2026-11-28.md`](e2e-report-2026-11-28.md)의 결함 A~F (+ G 어절 줄바꿈)
- 커밋: `443d676` (GitHub `hijun67/261127-sns-autopilot`, main)
- 배포: Cloudflare Pages `sns-autopilot` 프로젝트, 배포 ID `4f1e6a89-23a0-4b5c-b615-6232e3f39cb8`
- 재검증 원자료: [`fix-verify-live-2026-11-28.json`](fix-verify-live-2026-11-28.json) (13개 항목 전부 PASS, 콘솔·페이지 에러 0)

## 1. 고친 내용

| 결함 | 원인 & 수정 | 파일 |
|---|---|---|
| **A** 카드뉴스 PNG 반투명 | `drawSlide()`가 `clearRect` 후 그라디언트만 칠해 마지막 stop의 알파가 남았다. 그라디언트 전에 불투명 베이스(`#0b1020` 다크 / `#ffffff` 라이트)를 `fillRect`로 채우도록 수정. 라이트 미리보기가 갈색으로 보이던 부수 증상도 함께 해소. | `public/js/cardnews.js` |
| **B** JSON 불러오기 후 새로고침 소실 | `#importFile` 핸들러가 `state = result.state` 후 저장하지 않았다. 복원 직후 `persist()` 호출 추가. | `public/js/app.js` |
| **C** 수익 목표 믹스 막대 0×0 | `.mix-fill`이 `span`(inline)이라 `width/height`가 무시됐다. `.mix-fill`·`.mix-bar`에 `display:block`. | `public/app.css` |
| **D** 지난 시각 슬롯 등록 / 12회 새벽 시간 날짜 오배정 | `resolveDaySlots()`를 새로 두어 (1) 이미 지난 슬롯은 등록에서 제외(`skipPast`), (2) 하루 창 첫 시각(12회는 07:00)보다 이른 01·03·05시는 **다음 날 날짜**로 배정. `fillDayQueue()`가 이 함수를 쓰도록 변경하고 건너뛴 개수(`past`)를 반환. 토스트에 "이미 지난 N개 슬롯은 건너뜀 · 자정 이후 N건은 내일 날짜로 등록" 안내. | `public/js/generator.js`, `public/js/app.js` |
| **E** 큐가 비어도 '오늘 예약'이 주기 숫자 | `todays.length \|\| freq` → `todays.length`. 0건이면 `예약 0건 · 하루 N회 주기`, 헤더 필은 `오늘 예약 0`. | `public/js/app.js` |
| **F** 모바일 블로그 목차 두 칸 겹침 | `.mini-list li`가 `display:flex`라 `<strong>`과 본문이 각각 flex 아이템이 됐다. `display:block` + 불릿을 `::before` 절대 배치로 바꿔 한 줄 흐름으로 정리. | `public/app.css` |
| **G** 글자 단위 줄바꿈 | `wrapText()`를 어절(공백) 단위 우선으로 재작성. 한 어절이 줄 폭을 넘을 때만 글자 단위로 쪼갠다. | `public/js/cardnews.js` |

그 밖에 `APP.version` 1.0.0 → **1.0.1**, `index.html`의 `/app.css`·`/js/app.js`에 `?v=1.0.1` 캐시 버스터 추가.

## 2. 검증

### 단위 테스트
```
node --test tests/*.test.mjs   →  tests 44 / pass 44 / fail 0
```
- `tests/fixes.test.mjs` 신규 14개: 가짜 캔버스로 `drawSlide()` 첫 `fillRect`가 전면 불투명 베이스인지(A), 어절 단위 `wrapText()`와 긴 단어 fallback(G), `resolveDaySlots()`의 자정 이후 날짜 배정·past 판정, `fillDayQueue()`의 지난 슬롯 제외(D).
- 기존 테스트 중 `fillDayQueue` 호출 2건은 고정 `now`(2026-11-27 08:00)를 넘기도록 수정 — 이제 지난 슬롯을 거르는 것이 정상 동작이기 때문.

### 라이브 재검증 (`scripts/verify_fixes.py`, Playwright/Chromium 1440×900·390×844)
| 항목 | 결과 |
|---|---|
| A. 미리보기 캔버스 8장 최소 알파 | 전부 **255** (비불투명 픽셀 0/1,166,400) — 다크·라이트 모두 |
| A. 실제 내려받은 `cardnews-01.png` | 1080×1080 RGBA, 알파값 분포 **255 하나뿐**, 흰 배경 합성 시 제목 판독 가능 |
| B. JSON 불러오기 → 새로고침 | 메모리 4 / localStorage 4 / 새로고침 후 4 (수정 전: 0) |
| C. 믹스 막대 | 30%→83px, 20%→55px, 15%→42px, 10%→28px (트랙 277px), 높이 7px — 다크·라이트 동일 |
| D. 12회 하루 채우기(00:49) | 12건 = 11-28 07~23시 9건 + **11-29 01·03·05시 3건**, 토스트에 안내 표시 |
| D. 4회 하루 채우기 | 09·13·18·22시 4건(현재 시각 이후만) |
| E. 빈 큐 | KPI 0 / `예약 0건 · 하루 4회 주기` / 필 `오늘 예약 0` |
| E. 큐 4건 | KPI 4 / `슬롯 4개 중 4개 등록` |
| F. 모바일 블로그 목차 | `li` 5개 모두 `display:block`, 폭 328px, 겹침 없음, 가로 넘침 0px |
| G. 배포본 `wrapText()` | 문장 3개 모두 어절 중간 절단 0건 |
| 콘솔·페이지 에러 | **0건** (데스크톱·모바일) |
| `/api/generate` | GET 200(providers 3종) / 키 없음 POST 400 |

스크린샷: `screenshots/fix-desktop-dashboard-mix-1440.png`, `fix-desktop-dashboard-empty-1440.png`, `fix-desktop-cardnews-dark-1440.png`, `fix-desktop-cardnews-light-1440.png`, `fix-desktop-queue-12freq-1440.png`, `fix-mobile-blog-tab-390.png`, `fix-cardnews-01-flattened-on-white.png`

## 3. 배포·토큰 처리

- Cloudflare 대시보드(`hijun67@gmail.com`)에서 임시 토큰 `tmp-sns-autopilot-fix-20261128` 발급 → `wrangler pages deploy public --project-name sns-autopilot` → 프로덕션 별칭이 새 배포를 가리킴을 API로 확인(`canonical_deployment = 4f1e6a89…`) → **토큰 삭제 후 `user/tokens/verify`·`accounts/…/pages/projects` 둘 다 HTTP 401** 확인.
- 토큰은 7일 만료(2026-12-05)로 만들었고 삭제 완료. 대시보드에 남은 활성 토큰은 `Instinct SNS autopost deploy`, `Instinct Workers deploy` 2개(이번 작업에서 만들지 않은 것).

## 4. 이번 범위에서 제외한 것 (E2E 보고서의 낮은 심각도 항목)

결함 H~M(긴 이름 ellipsis, 큐 내림차순, 항목 개별 삭제, 멀티 패키지 동시 등록, 토스트 누적, 브랜드 기본값 `한일 님`, 슬라이더 정규화, 기본 주제 문구 중복, 라이트 라벨 대비, 모바일 하단 '수익 목표' 없음)은 이번 6건 수정 범위가 아니어서 그대로 두었다. `한일 님` 브랜드 기본값은 PNG 하단에 그대로 찍힌다(위 스크린샷 참고).
