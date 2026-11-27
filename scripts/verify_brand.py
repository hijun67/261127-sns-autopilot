"""SNS 오토파일럿 — 브랜드 기본값 '코네스' 라이브 검증 (v1.0.2).

사용법: python3 scripts/verify_brand.py <base_url> <out_dir>
확인:
  1) 새 방문 시 설정 브랜드 표기 기본값 = '코네스'
  2) 설정에서 브랜드를 빈 값으로 저장해도 '코네스'로 복원
  3) 카드뉴스 미리보기 캔버스 하단이 정확히 '코네스'로 그려짐
     (미리보기 하단 밴드 픽셀 == 같은 조건으로 '코네스'를 그린 밴드 픽셀, 빈 값 렌더와는 다름)
  4) 내려받은 PNG 1장 저장 (육안 확인용)
결과: <out_dir>/brand-verify.json, brand-cardnews-preview.png, brand-cardnews-01.png
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip('/')
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
report = {'base': BASE, 'checks': {}}


def record(key, ok, detail):
    report['checks'][key] = {'ok': bool(ok), 'detail': detail}
    print(('PASS' if ok else 'FAIL'), key, json.dumps(detail, ensure_ascii=False)[:600], flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul',
                              accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(BASE, wait_until='networkidle')
    page.evaluate("localStorage.clear()")
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(500)

    report['app_version'] = page.inner_text('#appVersion').strip()

    # 1) 새 방문 기본값 (아직 저장 전이므로 localStorage는 null일 수 있다 — 입력칸으로 확인)
    state_brand = page.evaluate(
        "JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'null')?.settings?.brandName ?? null")
    page.click('#settingsBtn')
    page.wait_for_selector('#brandInput', state='visible')
    input_val = page.input_value('#brandInput')
    page.screenshot(path=os.path.join(OUT, 'brand-settings-default.png'))
    record('default_brand', input_val == '코네스' and state_brand in (None, '코네스'),
           {'localStorage.brandName': state_brand, 'brandInput': input_val, 'version': report['app_version']})

    # 2) 빈 값으로 저장 → 복원
    page.fill('#brandInput', '   ')
    page.click('#saveSettingsBtn')
    page.wait_for_timeout(400)
    blank_brand = page.evaluate(
        "JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'null')?.settings?.brandName ?? null")
    page.click('#settingsBtn')
    page.wait_for_selector('#brandInput', state='visible')
    input_after_blank = page.input_value('#brandInput')
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    record('blank_restores_default', blank_brand == '코네스' and input_after_blank == '코네스',
           {'savedBlankValue': '   ', 'localStorage.brandName': blank_brand, 'brandInput': input_after_blank})

    # 2-1) 예전 기본값('한일 님')이 저장된 브라우저도 '코네스'로 옮겨오는지
    page.evaluate("""() => {
      const st = JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}');
      st.settings = Object.assign({}, st.settings, {brandName: '한일 님'});
      localStorage.setItem('sns-autopilot-state-v1', JSON.stringify(st));
    }""")
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(500)
    page.click('#settingsBtn')
    page.wait_for_selector('#brandInput', state='visible')
    legacy_input = page.input_value('#brandInput')
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    record('legacy_value_migrated', legacy_input == '코네스', {'seededBrandName': '한일 님', 'brandInput': legacy_input})

    # 3) 카드뉴스 생성 → 미리보기 하단 브랜드 렌더 확인
    page.click('.nav-item[data-view="studio"]')
    page.wait_for_timeout(200)
    page.fill('#keywordInput', '연말정산 환급 늘리는 순서')
    page.click('#generateBtn')
    page.wait_for_selector('#resultBody:not([hidden])', timeout=20000)
    page.wait_for_timeout(600)
    page.click('#openCardsBtn')
    page.wait_for_selector('.card-canvas', timeout=15000)
    page.wait_for_timeout(800)

    # 미리보기 하단 밴드(브랜드 베이스라인 1002px)를, 같은 조건(강조색·테마·장 번호)으로
    # 브랜드만 바꿔 새로 그린 밴드와 픽셀 단위로 비교한다.
    ink = page.evaluate("""async () => {
      const mod = await import('/js/cardnews.js');
      const data = await import('/js/data.js');
      const st = JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}');
      const goalId = st.lastGenerated?.meta?.goalId || st.focusGoal || 'affiliate';
      const accent = data.getGoal(goalId)?.color || '#7c8cff';
      const theme = st.settings?.theme || 'dark';
      const canvases = [...document.querySelectorAll('.card-canvas')];
      const total = canvases.length;
      const BAND = {x: 84, y: 950, w: 520, h: 70};  // 브랜드 표기 영역만 (우측 고정 라벨 제외)
      const grab = (g) => g.getImageData(BAND.x, BAND.y, BAND.w, BAND.h).data;
      const render = (brand, index) => {
        const c = document.createElement('canvas'); c.width = c.height = 1080;
        const g = c.getContext('2d');
        mod.drawSlide(g, {kicker: 'PREVIEW', headline: '브랜드 확인', body: '하단 표기 확인용', emphasis: true},
                      {index, total, accent, theme, brand});
        return grab(g);
      };
      const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2]) n++; } return n; };
      const inkCount = (d) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2] > 90) n++; return n; };
      const out = {defaultBrand: data.defaultState().settings.brandName, goalId, accent, theme, total,
                   matchCones: 0, diffEmpty: [], diffOther: [], checked: 0};
      for (let i = 0; i < total; i++) {
        const preview = grab(canvases[i].getContext('2d'));
        const cones = render('코네스', i);
        out.checked++;
        if (diff(preview, cones) === 0) out.matchCones++;
        out.diffEmpty.push([i, diff(preview, render('', i))]);
        out.diffOther.push([i, diff(preview, render('다른브랜드', i))]);
      }
      if (total) {
        out.inkCones = inkCount(render('코네스', 0));
        out.inkEmpty = inkCount(render('', 0));
        out.previewInk = inkCount(grab(canvases[0].getContext('2d')));
      }
      return out;
    }""")
    ok_ink = (ink['defaultBrand'] == '코네스' and ink['checked'] > 0
              and ink['matchCones'] == ink['checked']
              and all(d > 0 for _, d in ink['diffEmpty'])
              and all(d > 0 for _, d in ink['diffOther'])
              and ink.get('previewInk', 0) == ink.get('inkCones', -1))
    record('cardnews_bottom_brand_rendered', ok_ink, ink)

    # 미리보기 첫 장 요소 캡처 (하단 브랜드가 보이도록)
    first = page.query_selector('.card-canvas')
    first.screenshot(path=os.path.join(OUT, 'brand-cardnews-preview.png'))
    page.screenshot(path=os.path.join(OUT, 'brand-cardnews-view-1440.png'))

    # 4) PNG 1장 다운로드
    with page.expect_download() as dl:
        page.click('[data-download="0"]')
    png_path = os.path.join(OUT, 'brand-cardnews-01.png')
    dl.value.save_as(png_path)
    page.wait_for_timeout(400)

    report['errors'] = errors
    report['png'] = {'path': png_path, 'bytes': os.path.getsize(png_path)}
    report['png_ok'] = os.path.getsize(png_path) > 1000

    with open(os.path.join(OUT, 'brand-verify.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps({'errors': errors, 'png': report['png']}, ensure_ascii=False))
    ctx.close()
    browser.close()

fails = [k for k, v in report['checks'].items() if not v['ok']]
print('RESULT', 'ALL PASS' if not fails else f'FAIL {fails}')
sys.exit(0 if not fails and report.get('png_ok') else 1)
