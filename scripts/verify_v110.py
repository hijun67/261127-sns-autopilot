"""SNS 오토파일럿 v1.1.0 — 소스 자동 수집 · 제휴링크 · 뉴스픽 본문/연결 댓글 분리 검증

사용법: python3 scripts/verify_v110.py <base_url> <out_dir> [--skip-network]
확인 항목
  1) 버전 1.1.0 · 설정에 쿠팡/토스/뉴스픽RSS 필드가 있다
  2) 소스별 자동 불러오기 UI (쿠팡·뉴스픽·URL 풀)
  3) 뉴스픽 파트너스: 본문(링크 없음) / 연결 댓글(제휴 링크) 분리 + 복사 버튼
  4) 큐에 연결 댓글 저장 + 댓글 복사 버튼
  5) URL 풀 등록 → 🎲 랜덤 뽑기 → 입력칸 자동 채움
  6) /api/sources/coupang(키 없음=400) · /api/sources/newspic(실제 기사) 응답
  7) 1440px · 390px 가로 오버플로 0, 콘솔/페이지 에러 0
결과: <out_dir>/v110-verify.json + 스크린샷
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip('/')
OUT = sys.argv[2]
SKIP_NETWORK = '--skip-network' in sys.argv
os.makedirs(OUT, exist_ok=True)
report = {'base': BASE, 'checks': {}, 'errors': []}


def record(key, ok, detail):
    report['checks'][key] = {'ok': bool(ok), 'detail': detail}
    print(('PASS' if ok else 'FAIL'), key, json.dumps(detail, ensure_ascii=False)[:800], flush=True)


def no_overflow(page):
    return page.evaluate(
        """() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth,
                   body: document.body.scrollWidth})""")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={'width': 1440, 'height': 1000}, locale='ko-KR', timezone_id='Asia/Seoul',
        accept_downloads=True, permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('dialog', lambda d: d.accept())

    page.goto(BASE, wait_until='networkidle')
    page.evaluate("localStorage.clear()")
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(700)

    # ---------- 1) 버전 · 설정 필드 ----------
    page.click('#settingsBtn')
    page.wait_for_selector('#coupangAccessKey', state='visible')
    version = page.inner_text('#appVersion').strip()
    fields = {}
    for sel in ['#coupangAccessKey', '#coupangSecretKey', '#coupangSubId',
                '#tossAccessKey', '#tossSecretKey', '#tossPublisherId', '#newspicRssInput']:
        fields[sel] = page.locator(sel).count() == 1
    body_text = page.inner_text('#settingsDialog')
    record('version_and_fields', version == '1.1.0' and all(fields.values()) and '고정 출발지 IP' in body_text,
           {'version': version, 'fields': fields, 'tossIpNotice': '고정 출발지 IP' in body_text})

    page.screenshot(path=os.path.join(OUT, 'v110-settings-source-1440.png'))

    # ---------- 5) URL 풀 등록 → 랜덤 뽑기 ----------
    page.click('#poolAddBtn')
    page.wait_for_timeout(200)
    empty_warn = page.locator('.toast').last.inner_text() if page.locator('.toast').count() else ''
    page.select_option('#poolKind', 'brandconnect')
    page.fill('#poolName', '제주 항공권 특가')
    page.fill('#poolUrl', 'https://brandconnect.naver.com/affiliate/test-1')
    page.click('#poolAddBtn')
    page.wait_for_timeout(400)
    pool = page.evaluate(
        "JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}')?.settings?.affiliatePool || []")
    page.screenshot(path=os.path.join(OUT, 'v110-settings-pool-1440.png'))
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    record('pool_add', len(pool) == 1 and pool[0]['name'] == '제주 항공권 특가' and 'brandconnect.naver.com' in pool[0]['url'],
           {'pool': pool, 'emptyAddToast': empty_warn})

    page.click('.nav-item[data-view="studio"]')
    page.wait_for_timeout(400)
    page.click('[data-source="self"]')
    page.wait_for_timeout(200)
    self_auto_hidden = page.evaluate("document.getElementById('sourceAuto').hidden")
    page.click('[data-source="brandconnect"]')
    page.wait_for_timeout(300)
    pool_count_text = page.inner_text('#sourceAuto')
    page.click('#poolDrawBtn')
    page.wait_for_timeout(400)
    keyword = page.input_value('#keywordInput')
    link = page.input_value('#linkInput')
    record('pool_draw', self_auto_hidden and '1개 등록' in pool_count_text
           and keyword == '제주 항공권 특가' and link.startswith('https://brandconnect.naver.com/'),
           {'selfAutoHidden': self_auto_hidden, 'autoPanel': pool_count_text.replace('\n', ' | ')[:200],
            'keyword': keyword, 'link': link})

    # ---------- 2) 쿠팡 자동 불러오기 UI ----------
    page.click('[data-source="coupang"]')
    page.wait_for_timeout(300)
    coupang_panel = page.inner_text('#sourceAuto')
    has_cat_select = page.locator('#coupangCategory').count() == 1
    record('coupang_ui', has_cat_select and '키 미등록' in coupang_panel
           and page.locator('#autoCoupangBtn').count() == 1,
           {'panel': coupang_panel.replace('\n', ' | ')[:240], 'select': has_cat_select})
    page.click('#autoCoupangBtn')
    page.wait_for_timeout(900)
    dialog_open = page.evaluate("document.getElementById('settingsDialog').open")
    toast_text = page.locator('.toast').last.inner_text() if page.locator('.toast').count() else ''
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    record('coupang_no_key_guide', dialog_open and '쿠팡파트너스' in toast_text,
           {'settingsOpened': dialog_open, 'toast': toast_text})

    # ---------- 3) 뉴스픽 파트너스 자동 수집 + 본문/댓글 ----------
    page.click('[data-source="newspic-partners"]')
    page.wait_for_timeout(300)
    page.click('[data-goal="newspic"]')
    page.wait_for_timeout(200)
    page.click('[data-channel="threads"]')
    page.wait_for_timeout(300)
    articles = []
    if not SKIP_NETWORK:
        page.click('#autoNewspicBtn')
        page.wait_for_selector('[data-article]', timeout=20000)
        articles = page.locator('[data-article]').all()
        record('newspic_autofetch', len(articles) >= 1,
               {'articleCount': len(articles), 'first': articles[0].inner_text().replace('\n', ' | ')[:160]})
        articles[0].click()
        page.wait_for_timeout(400)
        keyword = page.input_value('#keywordInput')
        link = page.input_value('#linkInput')
        record('newspic_fill', bool(keyword) and 'newspic.kr' in link, {'keyword': keyword, 'link': link})
        page.screenshot(path=os.path.join(OUT, 'v110-newspic-source-1440.png'))
    else:
        keyword = '강호동 아들 골프 준우승'
        link = 'https://www.newspic.kr/view.html?nid=2026112716594690607&pn=82'
        page.fill('#keywordInput', keyword)
        page.fill('#linkInput', link)
        page.wait_for_timeout(200)

    page.click('#generateBtn')
    page.wait_for_timeout(1200)

    partner_visible = page.evaluate("!document.getElementById('resultPartner').hidden")
    body_text = page.inner_text('#partnerBody')
    comment_text = page.inner_text('#partnerComment')
    body_lines = [l for l in body_text.split('\n') if l.strip()]
    record('partner_split', partner_visible and 2 <= len(body_lines) <= 3 and 'http' not in body_text
           and 'http' in comment_text,
           {'visible': partner_visible, 'lines': len(body_lines), 'body': body_text,
            'comment': comment_text[:200]})

    page.click('#copyBodyBtn')
    page.wait_for_timeout(300)
    clip_body = page.evaluate("navigator.clipboard.readText()")
    page.click('#copyCommentBtn')
    page.wait_for_timeout(300)
    clip_comment = page.evaluate("navigator.clipboard.readText()")
    record('partner_copy_buttons', clip_body.strip() == body_text.strip()
           and 'http' in clip_comment and clip_comment.strip() == comment_text.strip(),
           {'bodyCopied': clip_body[:120], 'commentCopied': clip_comment[:160]})
    page.screenshot(path=os.path.join(OUT, 'v110-partner-result-1440.png'))

    # SNS 탭에서도 분리 표시
    page.click('#resultTabs [data-tab="sns"]')
    page.wait_for_timeout(400)
    sns_text = page.inner_text('#tabPanels')
    record('partner_sns_tab', '본문 복사' in sns_text and '연결 댓글 복사' in sns_text and '링크 없음' in sns_text,
           {'snsTab': sns_text.replace('\n', ' | ')[:300]})
    page.screenshot(path=os.path.join(OUT, 'v110-partner-sns-tab-1440.png'))

    # ---------- 4) 큐에 등록 → 댓글 저장 ----------
    page.click('#addQueueBtn')
    page.wait_for_timeout(500)
    queue = page.evaluate("JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}').queue || []")
    item = queue[-1] if queue else {}
    record('queue_comment_saved', bool(item.get('comment')) and 'http' in (item.get('comment') or '')
           and bool(item.get('partnerBody')),
           {'queueCount': len(queue), 'comment': (item.get('comment') or '')[:160],
            'partnerBody': (item.get('partnerBody') or '')[:80]})
    page.click('.nav-item[data-view="queue"]')
    page.wait_for_timeout(400)
    queue_text = page.inner_text('#queueList')
    record('queue_comment_button', '댓글 복사' in queue_text and '본문+댓글' in queue_text,
           {'queueList': queue_text.replace('\n', ' | ')[:260]})
    page.screenshot(path=os.path.join(OUT, 'v110-queue-1440.png'))

    # ---------- 6) API (브라우저 밖에서 호출 — 콘솔 에러 집계를 오염시키지 않기 위해) ----------
    import urllib.error
    import urllib.request

    def http_json(path, payload=None):
        url = f'{BASE}{path}'
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=data, headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
            'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return res.status, json.loads(res.read().decode())
        except urllib.error.HTTPError as err:
            raw = err.read().decode() or '{}'
            try:
                return err.code, json.loads(raw)
            except json.JSONDecodeError:
                return err.code, {'raw': raw[:200]}

    cstatus, cbody = http_json('/api/sources/coupang', {'accessKey': '', 'secretKey': ''})
    nstatus, nbody = http_json('/api/sources/newspic?limit=3')
    api = {
        'coupang': {'status': cstatus, **cbody},
        'newspic': {'status': nstatus, 'ok': nbody.get('ok'), 'hot': len(nbody.get('hot') or []),
                    'first': (nbody.get('hot') or [{}])[0].get('title', ''), 'rssError': nbody.get('rssError')},
    }
    record('api_coupang_no_key', cstatus == 400 and '쿠팡' in cbody.get('error', ''), api['coupang'])
    record('api_newspic_live', nstatus == 200 and api['newspic']['hot'] >= 1, api['newspic'])

    # ---------- 7) 오버플로 ----------
    desktop = no_overflow(page)
    record('desktop_no_overflow', desktop['sw'] <= desktop['iw'] + 1, desktop)

    mob = ctx.new_page()
    mob.set_viewport_size({'width': 390, 'height': 844})
    mob.goto(BASE, wait_until='networkidle')
    mob.wait_for_timeout(600)
    mob.click('.mnav[data-view="studio"]')
    mob.wait_for_timeout(500)
    mob.click('[data-source="newspic-partners"]')
    mob.wait_for_timeout(400)
    mobile = no_overflow(mob)
    mob.screenshot(path=os.path.join(OUT, 'v110-studio-mobile-390.png'), full_page=False)
    mob.screenshot(path=os.path.join(OUT, 'v110-studio-mobile-full-390.png'), full_page=True)
    record('mobile_no_overflow', mobile['sw'] <= mobile['iw'] + 1, mobile)
    mob.close()

    record('console_errors', len(errors) == 0, {'errors': errors[:10]})
    report['errors'] = errors
    browser.close()

with open(os.path.join(OUT, 'v110-verify.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

failed = [k for k, v in report['checks'].items() if not v['ok']]
print('RESULT', 'ALL PASS' if not failed else f'FAILED: {failed}')
sys.exit(0 if not failed else 1)
