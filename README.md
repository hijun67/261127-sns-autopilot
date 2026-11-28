# SNS 오토파일럿 (SNS Autopilot) v1.1.0

매일 **1회 ~ 24회**, **9개 채널**에 올릴 콘텐츠를 한 곳에서 만들고 발행 큐까지 관리하는 SNS 자동화 스튜디오입니다.
소스 하나(뉴스픽·쿠팡파트너스·브랜드커넥트·토스·내 사이트·키워드)를 넣으면 **쇼츠 대본 · 카드뉴스(1080×1080) · 블로그 HTML · SNS 단문/스레드** 4종을 한 번에 만들고, 하루 타임테이블에 맞춰 큐에 쌓습니다.

- **라이브**: **https://sns-autopilot-bin.pages.dev** (Cloudflare Pages)
  - 프로젝트 이름은 `sns-autopilot` 이지만, `sns-autopilot.pages.dev` 주소는 **다른 사용자가 이미 선점**하고 있어(2026-11-27 확인, 일본어 ‘投稿案の承認’ 서비스) Cloudflare가 `-bin` 접미사를 붙였습니다. 원하시면 나중에 `sns.cones.info` 같은 사용자 도메인을 붙일 수 있습니다.
- **저장소**: `hijun67/261127-sns-autopilot`
- **만든 날**: 2026-11-27 (KST)

## v1.1.0 — 소스별 자동 수집 · 제휴링크 · 본문/댓글 분리

소스를 고르면 스튜디오 1단계 아래에 **그 소스에 맞는 자동 불러오기 영역**이 붙습니다.

| 소스 | 자동 불러오기 | 채워지는 값 |
|---|---|---|
| 🛒 쿠팡 파트너스 | 카테고리(19개) 랜덤/지정 → 상품 1개 랜덤 → 제휴 딥링크 발급 | 상품명 · 제휴 링크(+가격·로켓배송·이미지 카드) |
| 📰 뉴스픽 파트너스 | 핫기사 목록(실시간 파싱) + 맞춤 RSS | 기사 제목 · 기사 링크 |
| 📰 뉴스픽 웹 | 위와 동일 | 기사 제목 · 기사 링크 |
| 🟩 네이버 브랜드커넥트 · 💙 토스 쉐어링크 | 제휴 URL 풀에서 🎲 랜덤 뽑기 | 상품명 · 제휴 링크 |
| ✍️ 자체 생성 · 🔗 내 사이트 URL | 없음(직접 입력) | — |

### 1. 쿠팡파트너스 자동 상품 선택 + 제휴 딥링크 (`/api/sources/coupang`)
- 설정 모달에 `Access Key` · `Secret Key` · `subId`(선택) 입력칸. 브라우저(`localStorage`)에만 저장하고 화면에는 **마스킹**(`AKIA••••••ABCD`)으로 보여 주며, **쿠팡 키 초기화** 버튼으로 지웁니다. 키는 서버에 저장되지 않고 요청마다 전달됩니다.
- 서버 함수가 Web Crypto `HMAC-SHA256` 으로 쿠팡 CEA 서명(`CEA algorithm=HmacSHA256,access-key=…,signed-date=…,signature=…`, `signed-date=YYMMDD'T'HHMMSS'Z'` UTC, 메시지 = `signed-date + method + path + query`)을 만들어
  - `GET /products/bestcategories/{categoryId}?limit=20&subId=…` (카테고리 미지정이면 19개 중 랜덤, 목록이 비면 `goldbox`로 폴백)
  - 랜덤 1개 선택 → `POST /v2/providers/affiliate_open_api/apis/openapi/v1/deeplink`
  - 응답: `{ title, price, isRocket, imageUrl, landingUrl(추적 링크), originalUrl, category }`
- 키가 없으면 **400 + 안내 문구**, 인증 실패 401·레이트리밋 429는 각각 구분해 메시지로 돌려줍니다. 딥링크만 실패하면 원본 상품 URL로 폴백하고 그 사실을 알립니다.

### 2. 뉴스픽 핫기사 + 맞춤 RSS (`/api/sources/newspic`)
- `https://www.newspic.kr` → `https://m.newspic.kr` 순서로 실제 HTML을 받아 **서버 렌더된 기사 목록을 파싱**합니다(제목 `<h1>`/`.heading`, 링크 `/view.html?nid=…`, 이미지 `data-original`, 요약 `.des`/`<h2>`). CSR·차단으로 실패하면 상태와 이유를 `warnings`로 남기고 RSS 경로로 계속 씁니다.
- 설정에 넣은 **뉴스픽 파트너스 맞춤 RSS XML**도 함께 파싱합니다(`<item>`·Atom `<entry>`, CDATA·엔티티·`media:content`/`enclosure` 이미지). SSRF 방지를 위해 **http(s) + `*.newspic.kr` 주소만** 서버가 대신 호출합니다.
- `articles`는 핫기사 먼저 + 내 RSS 순으로 합치고 같은 링크는 한 번만 돌려줍니다.

### 3. 뉴스픽 파트너스 전용 포맷 (본문 / 연결 댓글 분리)
- **본문**: 호기심을 자극하는 **후킹 2~3줄**, 링크 없음
- **연결 댓글**: **제휴 링크 + 댓글 유도 문구**(첫 댓글용). 대가성 문구가 켜져 있으면 댓글 끝에 함께 붙습니다.
- 결과 패널과 SNS 탭에 **본문 복사 / 연결 댓글 복사** 버튼을 각각 두고, AI 프롬프트도 `partner.body`·`partner.comment`를 따로 요구합니다. AI가 본문에 링크를 넣으면 제거하고 3줄로 자릅니다.
- 큐 항목에도 `partnerBody`·`comment`를 함께 저장해 나중에 **댓글 복사** 버튼으로 꺼낼 수 있습니다.

### 4. 브랜드커넥트 · 토스 쉐어링크 URL 풀 + 토스 API 설정
- 설정의 **제휴 URL 풀**에 상품명·URL·종류(브랜드커넥트/토스/쿠팡/기타)를 여러 개 등록·삭제. 스튜디오에서 **🎲 랜덤 뽑기**를 누르면 해당 소스 종류에서 1개를 골라 상품명·링크를 자동 입력합니다(없으면 `기타` → 전체 순 폴백).
- 설정에 토스 쉐어링크 `Access Key`·`Secret Key`·`publisherId` 입력칸과 **“토스 Open API는 고정 출발지 IP 등록이 필요함”** 안내를 넣었습니다. IP 등록 전에는 링크 발급 호출이 거부되므로 URL 풀 방식과 함께 씁니다.

## 화면

| 데스크톱 1440px | 모바일 390px | 카드뉴스 |
|---|---|---|
| ![데스크톱](docs/screenshots/desktop-dashboard-1440.png) | ![모바일](docs/screenshots/mobile-dashboard-390.png) | ![카드뉴스](docs/screenshots/desktop-cardnews-1440.png) |

| 생성 스튜디오 | 스케줄 · 큐 | 라이트 모드 |
|---|---|---|
| ![스튜디오](docs/screenshots/desktop-studio-1440.png) | ![큐](docs/screenshots/desktop-queue-1440.png) | ![라이트](docs/screenshots/desktop-dashboard-light-1440.png) |

## 1단계에서 되는 것

### 1. 게시 채널 9곳
| 채널 | 지원 포맷 | API | 비고 |
|---|---|---|---|
| Instagram | 릴스 · 카드뉴스 | Meta Graph API | Business/Creator 계정 |
| Threads | 스레드 · 카드뉴스 | Threads API | 500자 |
| Facebook | 피드 · 카드뉴스 | Meta Graph API | 페이지 단위 |
| X | 트윗/스레드 · 카드뉴스 | X API v2 | 280자 · 무료 플랜 쓰기 한도 작음 |
| TikTok | 쇼츠 | Content Posting API | 심사 필요 |
| YouTube Shorts | 쇼츠 | Data API v3 | 업로드 1건 1,600 units |
| Google Blogger | 블로그 | Blogger API v3 | `cones.asia` 등 HTML 원문 |
| 네이버 블로그 | 블로그 | **공식 글쓰기 API 종료** | 원클릭 복사 → 스마트에디터 |
| 티스토리 | 블로그 | **공식 글쓰기 API 종료** | 원클릭 복사 → HTML 모드 |

### 2. 콘텐츠 4종 자동 생성
- **쇼츠·릴스**: 3초 훅 + 6씬(타임코드·화면·나레이션·자막) + 캡션 + 썸네일 문구
- **카드뉴스**: 최대 8장, 브라우저 Canvas로 1080×1080 렌더링, 장별 PNG 저장(전체 저장 지원)
- **블로그**: SEO 제목·메타 설명·소제목·표·FAQ·HTML(인라인 스타일 없이 Blogger 호환) + 텍스트 복사
- **SNS**: X 스레드(각 280자 이내 자동 절삭) · Threads · Facebook 본문

### 3. 수익화·운영 목표 9종
판매수수료(쿠팡·네이버쇼핑·토스쇼핑) · 네이버 홈판/애드포스트 · 뉴스픽 조회수 · 애드센스 트래픽(cones.info·cones.asia·티스토리) · 이벤트·CPA(event-pick) · 구독자/팔로워 DB · 숏폼 조회수·리워드 · 원소스 멀티유즈 · 브랜드 협찬/원고료.

목표를 고르면 **훅 각도 · 본문 · CTA · 링크 구조(UTM)** 가 함께 바뀝니다. 제휴 소스(쿠팡·브랜드커넥트·토스)를 고르면 **공정위 대가성 문구**가 본문·카드뉴스 마지막 장·블로그 하단에 자동 삽입되며, 스튜디오 토글로 끌 수 있습니다(기본 ON).

### 4. 소스 · 제휴 허브 7곳
뉴스픽 파트너스 · 쿠팡 파트너스 · 네이버 브랜드커넥트 · 토스 쉐어링크 · 자체 생성(키워드) · 뉴스픽 웹 · 내 사이트 URL.

### 5. 스케줄러 · 발행 큐
- 주기 **1 · 2 · 4 · 6 · 12 · 24회/일** → 타임테이블 자동 생성
  (4회 → 09:00 · 13:00 · 18:00 · 22:00)
- **반자동**: 생성 후 승인 → 발행 / **자동**: API 지원 채널은 승인 없이 발행 대기
- 상태: 대기 → 승인 → 발행 / 건너뛰기(되돌리기 가능). 발행 완료는 되돌리지 않음
- `localStorage` 영속화, **JSON 내보내기/불러오기**, 큐 비우기
- 채널은 슬롯마다 순환 배정되어 하루 동안 여러 채널이 고르게 섞입니다

### 6. AI 생성 (BYOK) + 프리뷰 템플릿
- `/api/generate` Cloudflare Pages Function이 **Gemini · OpenRouter · Groq** 를 프록시합니다. 키는 서버에 저장하지 않고 요청마다 받아 그 요청에서만 사용합니다.
- 키가 없으면 **구조화 프리뷰 템플릿**으로 즉시 4종을 생성합니다. UI 상단 배지와 결과 패널에 `프리뷰 템플릿 / AI 연결` 모드가 항상 표시됩니다.
- AI 응답이 JSON이 아니거나 실패하면 프리뷰로 자동 대체하고 토스트로 알립니다.

## 구조

```
public/
  index.html          # 6개 뷰 + 설정 다이얼로그
  app.css             # 다크/라이트 테마, 1440·390 반응형
  js/
    data.js           # 채널·포맷·목표·소스·주기 카탈로그 (단일 출처)
    generator.js      # 스케줄·콘텐츠 생성·큐 상태 전이 (순수 함수)
    store.js          # localStorage 병합·JSON 내보내기/불러오기
    cardnews.js       # Canvas 1080×1080 렌더·PNG 저장
    partner.js        # 뉴스픽 파트너스 본문/연결 댓글 생성 (순수 함수)
    sourcehub.js      # 제휴 URL 풀·키 마스킹·소스 API 호출 래퍼
    app.js            # UI 컨트롤러
functions/api/generate.js          # BYOK AI 프록시 (Gemini/OpenRouter/Groq)
functions/api/sources/coupang.js   # 쿠팡 상품 랜덤 선택 + 제휴 딥링크
functions/api/sources/newspic.js   # 뉴스픽 핫기사 + 맞춤 RSS
functions/api/sources/_lib.js      # CEA 서명·HTML/RSS 파서·SSRF 가드
tests/core.test.mjs         # 단위 테스트 (node:test, 의존성 0)
tests/v1_1_0.test.mjs       # v1.1.0 소스·서명·파서·본문/댓글·풀 테스트
scripts/verify_v110.py      # v1.1.0 Playwright 검증 (소스 자동 수집·복사 버튼·API)
scripts/verify_ui.py        # 기본 흐름 검증 + 스크린샷
```

## 로컬 실행

```bash
# 정적 UI
python3 -m http.server 4173 --directory public

# 단위 테스트 (Node 20+)
node --test tests/*.test.mjs

# UI 검증 (Playwright + Chromium, 스크린샷 재생성)
python3 scripts/verify_ui.py
```

## 배포

```bash
wrangler pages deploy public --project-name sns-autopilot
```
`functions/` 폴더가 함께 업로드되어 `/api/generate` 가 활성화됩니다.

## API 계약

`GET /api/generate`
```json
{ "ok": true, "service": "sns-autopilot", "providers": ["gemini", "openrouter", "groq"] }
```

`POST /api/generate`
```json
{ "provider": "gemini", "apiKey": "AIza...", "prompt": "..." }
```
- 성공: `{ "ok": true, "provider": "gemini", "model": "gemini-2.5-flash", "text": "..." }`
- 실패: `{ "ok": false, "error": "..." }` (400 키/입력 오류, 401/429/502/504 업스트림 오류)

`POST /api/sources/coupang`
```json
{ "accessKey": "...", "secretKey": "...", "subId": "sns-auto", "categoryId": 0, "limit": 20 }
```
- 성공: `{ "ok": true, "item": { "title", "price", "isRocket", "imageUrl", "landingUrl", "originalUrl", "category" }, "deeplinkOk": true }`
- 키 없음 **400**, 인증 실패 **401**, 레이트리밋 **429**, 업스트림 오류 **502/504**

`GET /api/sources/newspic?limit=8&category=hot&rss=https://partners.newspic.kr/...xml`
- 성공: `{ "ok": true, "articles": [{ "title", "link", "image", "summary", "from": "hot|rss" }], "hot": [...], "rss": [...], "warnings": [] }`
- RSS URL이 `*.newspic.kr` 밖이면 `rssError`에 이유를 담고 핫기사만 돌려줍니다.

## 검증 결과 (2026-11-28 · v1.1.0)

`scripts/verify_v110.py` 를 라이브(https://sns-autopilot-bin.pages.dev)에서 실행 → **17/17 ALL PASS**
- 버전 1.1.0 · 설정의 쿠팡/토스/뉴스픽RSS 필드 7개 · 토스 고정 IP 안내
- URL 풀 등록 → 🎲 뽑기로 상품명·링크 자동 입력
- 뉴스픽 핫기사 **8건 라이브 파싱** → 클릭 시 제목·링크 채움
- 뉴스픽 파트너스: 본문 3줄(링크 없음) / 연결 댓글(제휴 링크) 분리, 두 복사 버튼 클립보드 값 일치
- 큐에 `comment`·`partnerBody` 저장 + '댓글 복사' 버튼
- `/api/sources/coupang` 빈 키 **400**, `/api/sources/newspic` **200**
- 콘솔/페이지 에러 **0**, 가로 넘침 **0**(1440·390)
- 단위 테스트 **72/72 통과** (`node --test tests/*.test.mjs`)
- 증빙: `docs/v110-verify-live-2026-11-28.json`, `docs/screenshots/v110-*.png`, 보고서 `docs/v110-report-2026-11-28.md`

## 검증 결과 (2026-11-27)

### 라이브 사이트 (https://sns-autopilot-bin.pages.dev)
`scripts/verify_live.py` — 실제 배포 URL에서 같은 흐름 재검증
- 콘솔/페이지 에러 **0건**, 가로 넘침 **0건**(1440·390)
- `/api/generate` GET **200**, 키 없이 POST **400**, 잘못된 키 POST **502 + 오류 메시지**
- 카드뉴스 8장 렌더, 4회/일 큐 4건(09·13·18·22시) 등록 확인

### 로컬 (상세)

`scripts/verify_ui.py` — 데스크톱 1440×900 + 모바일 390×844 Chromium 실행

- 콘솔 에러 **0건**, 페이지 에러 **0건**, 실패 요청 **0건**
- 가로 넘침 **0건** (대시보드·스튜디오·카드뉴스·큐, 다크/라이트, 1440/390 전부)
- 흐름: 쿠팡 파트너스 → 판매수수료 → Instagram → 카드뉴스 생성 → 블로그 탭 대가성 문구 확인 → 카드뉴스 8장 렌더(픽셀 채움률 100%) → 4회/일 큐 4건(09·13·18·22시) → 승인 → 발행 → 새로고침 후 유지
- 단위 테스트 **30/30 통과**

## 1단계의 한계 (2단계에서 이어짐)

- **실제 게시는 아직 수동**입니다. 이 버전은 콘텐츠 생성·큐·승인까지이며, 각 플랫폼 API로 실제 업로드하는 워커는 2단계입니다. 그래서 `발행 처리`는 “게시했다”가 아니라 “복사해서 올릴 준비가 끝났다”는 기록입니다.
- 네이버 블로그·티스토리는 공식 글쓰기 API가 종료되어 **원클릭 복사 → 붙여넣기**만 지원합니다.
- 쇼츠·릴스는 **대본·자막 패키지**까지이며 MP4 합성은 2단계입니다.
- AI 키와 큐는 **이 브라우저의 localStorage**에만 저장됩니다. 다른 기기로 옮길 때는 JSON 내보내기/불러오기를 쓰세요.
- 프리뷰 템플릿의 숫자·표현은 예시 문구입니다. 발행 전에 실제 조건으로 확인하세요.

## 개인정보 · 보안

- 서버에 저장하는 사용자 데이터가 없습니다. API 키는 요청 본문으로만 전달되고 Cloudflare 로그에 남기지 않습니다.
- 외부 스크립트·폰트 CDN을 쓰지 않아 추적기가 없습니다.
