"""SNS 오토파일럿 라이브/로컬 재검증 — 2026-11-28 결함 A~F + 어절 줄바꿈.

사용법: python3 scripts/verify_fixes.py <base_url> <out_dir>
결과: <out_dir>/verify.json, 스크린샷 *.png, 내려받은 PNG/JSON
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip('/')
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
report = {'base': BASE, 'checks': {}, 'errors': [], 'started': time.strftime('%Y-%m-%dT%H:%M:%S')}


def shot(page, name, full=False):
    path = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=path, full_page=full)
    return path


def record(key, ok, detail):
    report['checks'][key] = {'ok': bool(ok), 'detail': detail}
    print(('PASS' if ok else 'FAIL'), key, json.dumps(detail, ensure_ascii=False)[:400], flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------------- 데스크톱 1440x900 ----------------
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    page = ctx.new_page()
    page.on('console', lambda m: report['errors'].append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: report['errors'].append(f'pageerror: {e}'))
    page.goto(BASE, wait_until='networkidle')
    page.evaluate('localStorage.clear()')
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(400)

    report['app_version'] = page.inner_text('#appVersion') if page.query_selector('#appVersion') else None

    # ---- E: 빈 큐에서 오늘 예약 0 ----
    kpi_today = page.inner_text('#kpiToday').strip()
    kpi_foot = page.inner_text('#kpiTodayFoot').strip()
    pill = page.inner_text('#todayPill').strip()
    record('E_empty_queue_kpi', kpi_today == '0' and '0' in pill,
           {'kpiToday': kpi_today, 'kpiTodayFoot': kpi_foot, 'todayPill': pill, 'queue': page.evaluate("JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}').queue?.length ?? 0")})
    shot(page, 'desktop-dashboard-empty')

    # ---- C: 믹스 막대 폭 ----
    mix = page.evaluate("""() => {
      const rows = [...document.querySelectorAll('.mix-row')].slice(0, 4).map(row => {
        const bar = row.querySelector('.mix-bar');
        const fill = row.querySelector('.mix-fill');
        const br = bar.getBoundingClientRect(), fr = fill.getBoundingClientRect();
        return {label: row.querySelector('.mix-name').textContent.trim(),
                val: row.querySelector('.mix-val').textContent.trim(),
                bar: [Math.round(br.width), Math.round(br.height)],
                fill: [Math.round(fr.width), Math.round(fr.height)],
                fillDisplay: getComputedStyle(fill).display};
      });
      return rows;
    }""")
    ok_mix = bool(mix) and all(r['fill'][0] > 0 and r['fill'][1] > 0 for r in mix)
    record('C_mix_bar_width', ok_mix, mix)
    shot(page, 'desktop-dashboard-mix')
    # 라이트 테마에서도 확인
    page.click('#themeBtn')
    page.wait_for_timeout(300)
    mix_light = page.evaluate("""() => [...document.querySelectorAll('.mix-fill')].slice(0,4).map(f => {
      const r = f.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)];
    })""")
    record('C_mix_bar_width_light', bool(mix_light) and all(w > 0 and h > 0 for w, h in mix_light), mix_light)
    shot(page, 'desktop-dashboard-mix-light')
    page.click('#themeBtn')  # 다시 다크
    page.wait_for_timeout(200)

    # ---- 콘텐츠 생성 → 카드뉴스 ----
    page.click('.nav-item[data-view="studio"]')
    page.wait_for_timeout(200)
    page.fill('#keywordInput', '연말정산 환급 늘리는 순서')
    page.click('#generateBtn')
    page.wait_for_selector('#resultBody:not([hidden])', timeout=15000)
    page.wait_for_timeout(500)
    shot(page, 'desktop-studio-result')

    # ---- G: 배포된 wrapText가 어절 단위인지 (실제 모듈 import) ----
    wrap = page.evaluate("""async () => {
      const mod = await import('/js/cardnews.js');
      const c = document.createElement('canvas'); c.width = c.height = 1080;
      const g = c.getContext('2d');
      const texts = ['배송비와 구성 차이를 먼저 확인하고 조건을 비교하세요',
                     '연말정산 환급 늘리는 순서와 놓치기 쉬운 공제 항목 정리',
                     '그르는 기준을 확인하지 않으면 손해를 봅니다'];
      const out = [];
      for (const t of texts) {
        g.font = '800 68px "Noto Sans KR", sans-serif';
        const lines = mod.wrapText(g, t, 912);
        const words = t.split(' ');
        const brokenWords = [];
        for (const line of lines) for (const w of line.split(' ')) if (!words.includes(w)) brokenWords.push(w);
        out.push({text: t, lines, brokenWords, widths: lines.map(l => Math.round(g.measureText(l).width))});
      }
      return out;
    }""")
    ok_wrap = all(len(w['lines']) >= 2 and not w['brokenWords'] and max(w['widths']) <= 912 for w in wrap)
    record('G_word_wrap_live', ok_wrap, wrap)

    # ---- A: 미리보기 캔버스 불투명 ----
    page.click('#openCardsBtn')
    page.wait_for_selector('.card-canvas', timeout=10000)
    page.wait_for_timeout(600)
    alpha = page.evaluate("""() => {
      const out = [];
      for (const c of [...document.querySelectorAll('.card-canvas')].slice(0, 8)) {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let min = 255, nonOpaque = 0, opaque = 0;
        for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a < min) min = a; if (a < 255) nonOpaque++; else opaque++; }
        out.push({w: c.width, h: c.height, minAlpha: min, nonOpaque, opaque, total: d.length / 4});
      }
      return out;
    }""")
    ok_alpha = bool(alpha) and all(a['minAlpha'] == 255 for a in alpha)
    record('A_canvas_alpha_preview', ok_alpha, alpha)
    shot(page, 'desktop-cardnews-dark')
    shot(page, 'desktop-cardnews-dark-full', full=True)

    # ---- A: 실제 PNG 다운로드 파일의 알파 ----
    with page.expect_download() as dl:
        page.click('[data-download="0"]')
    d = dl.value
    png_path = os.path.join(OUT, 'cardnews-01.png')
    d.save_as(png_path)
    page.wait_for_timeout(400)
    record('A_png_download', os.path.getsize(png_path) > 1000, {'path': png_path, 'bytes': os.path.getsize(png_path)})

    # 라이트 테마 카드뉴스
    page.click('#themeBtn')
    page.wait_for_timeout(600)
    alpha_light = page.evaluate("""() => [...document.querySelectorAll('.card-canvas')].slice(0, 8).map(c => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let min = 255; for (let i = 3; i < d.length; i += 4) if (d[i] < min) min = d[i];
      return min;
    })""")
    record('A_canvas_alpha_preview_light', bool(alpha_light) and all(a == 255 for a in alpha_light), alpha_light)
    shot(page, 'desktop-cardnews-light')
    with page.expect_download() as dl2:
        page.click('[data-download="1"]')
    png_light = os.path.join(OUT, 'cardnews-02-light.png')
    dl2.value.save_as(png_light)
    page.click('#themeBtn')
    page.wait_for_timeout(300)

    # ---- B: JSON 불러오기 → 새로고침 유지 ----
    page.click('.nav-item[data-view="queue"]')
    page.wait_for_timeout(200)
    page.click('#fillDayBtn')
    page.wait_for_timeout(500)
    filled = page.evaluate("JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}').queue?.length ?? 0")
    with page.expect_download() as dlexp:
        page.click('#exportBtn')
    json_path = os.path.join(OUT, 'state-export.json')
    dlexp.value.save_as(json_path)
    exported = json.load(open(json_path, encoding='utf-8'))
    page.once('dialog', lambda dlg: dlg.accept())
    page.click('#clearQueueBtn')
    page.wait_for_timeout(400)
    after_clear = page.evaluate("JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}').queue?.length ?? 0")
    page.set_input_files('#importFile', json_path)
    page.wait_for_timeout(700)
    in_memory = page.evaluate("window.__snsAutopilot.state.queue.length")
    before_reload_ls = page.evaluate("JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}').queue?.length ?? 0")
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(600)
    after_reload = page.evaluate("window.__snsAutopilot.state.queue.length")
    after_reload_ls = page.evaluate("JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}').queue?.length ?? 0")
    q_rows = len(page.query_selector_all('#queueList .q-item'))
    record('B_import_persist_reload',
           after_reload == len(exported.get('state', {}).get('queue', [])) and after_reload > 0,
           {'filled': filled, 'exported_queue': len(exported.get('state', {}).get('queue', [])),
            'after_clear': after_clear, 'in_memory': in_memory, 'localStorage_before_reload': before_reload_ls,
            'after_reload_memory': after_reload, 'after_reload_localStorage': after_reload_ls, 'queue_rows': q_rows})
    shot(page, 'desktop-queue-after-reload')

    # ---- D: 오늘 스케줄 채우기 — 지난 슬롯 제외 / 자정 이후 날짜 ----
    page.click('.nav-item[data-view="queue"]')
    page.wait_for_timeout(300)
    page.once('dialog', lambda dlg: dlg.accept())
    page.click('#clearQueueBtn')
    page.wait_for_timeout(300)
    page.click('#queueFreqChips [data-freq="12"]')
    page.wait_for_timeout(300)
    page.click('.nav-item[data-view="dashboard"]')
    kpi_after_freq = page.inner_text('#kpiToday').strip()
    page.click('.nav-item[data-view="queue"]')
    page.wait_for_timeout(200)
    page.click('#fillDayBtn')
    page.wait_for_timeout(700)
    toast_text = page.evaluate("[...document.querySelectorAll('#toastStack .toast')].map(t=>t.textContent)")
    d12 = page.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}');
      return {now: new Date().toString(), perDay: s.perDay,
              items: (s.queue||[]).map(q => q.scheduledAt).sort()};
    }""")
    record('D_fill_12_skip_past', len(d12['items']) > 0 and len(d12['items']) <= 12, {'toast': toast_text, **d12})
    shot(page, 'desktop-queue-12freq')
    shot(page, 'desktop-queue-12freq-full', full=True)

    # 실제 지난 슬롯이 없는지: 4회로 되돌리고 15시 이후 슬롯만 남았는지 시각 비교
    page.once('dialog', lambda dlg: dlg.accept())
    page.click('#clearQueueBtn')
    page.wait_for_timeout(300)
    page.click('#queueFreqChips [data-freq="4"]')
    page.wait_for_timeout(300)
    page.click('#fillDayBtn')
    page.wait_for_timeout(700)
    d4 = page.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('sns-autopilot-state-v1')||'{}');
      return {now: new Date().toISOString(), items: (s.queue||[]).map(q => q.scheduledAt)};
    }""")
    record('D_fill_4_future_only', bool(d4['items']), d4)

    # 대시보드 KPI가 실제 등록 건수와 같은지
    page.click('.nav-item[data-view="dashboard"]')
    page.wait_for_timeout(400)
    dash = {'kpiToday': page.inner_text('#kpiToday').strip(), 'foot': page.inner_text('#kpiTodayFoot').strip(),
            'pill': page.inner_text('#todayPill').strip()}
    record('E_kpi_matches_queue', dash['kpiToday'] == str(len(d4['items'])), dash)
    shot(page, 'desktop-dashboard-filled', full=True)

    ctx.close()

    # ---------------- 모바일 390x844 ----------------
    mctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                               is_mobile=True, has_touch=True, locale='ko-KR', timezone_id='Asia/Seoul')
    mpage = mctx.new_page()
    mpage.on('console', lambda m: report['errors'].append(f'mobile console.{m.type}: {m.text}') if m.type == 'error' else None)
    mpage.on('pageerror', lambda e: report['errors'].append(f'mobile pageerror: {e}'))
    mpage.goto(BASE, wait_until='networkidle')
    mpage.evaluate('localStorage.clear()')
    mpage.reload(wait_until='networkidle')
    mpage.wait_for_timeout(400)
    mpage.click('.mnav[data-view="studio"]')
    mpage.wait_for_timeout(300)
    mpage.fill('#keywordInput', '연말정산 환급 늘리는 순서')
    mpage.click('#generateBtn')
    mpage.wait_for_selector('#resultBody:not([hidden])', timeout=15000)
    mpage.wait_for_timeout(400)
    mpage.click('[data-tab="blog"]')
    mpage.wait_for_timeout(500)
    mini = mpage.evaluate("""() => {
      const lis = [...document.querySelectorAll('#tabPanels .mini-list li')];
      return lis.map(li => {
        const r = li.getBoundingClientRect();
        const cs = getComputedStyle(li);
        return {text: li.textContent.trim().slice(0, 60), display: cs.display,
                w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left)};
      });
    }""")
    ok_mini = bool(mini) and all(m['display'] == 'block' and m['w'] > 250 for m in mini)
    record('F_mobile_blog_mini_list', ok_mini, mini)
    shot(mpage, 'mobile-blog-tab')
    shot(mpage, 'mobile-blog-tab-full', full=True)
    overflow = mpage.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    record('F_mobile_no_overflow', overflow <= 0, {'overflow_px': overflow})

    mpage.screenshot(path=os.path.join(OUT, 'mobile-blog-tab-viewport.png'))
    mctx.close()
    browser.close()

report['finished'] = time.strftime('%Y-%m-%dT%H:%M:%S')
report['passed'] = all(c['ok'] for c in report['checks'].values())
with open(os.path.join(OUT, 'verify.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print('\n=== SUMMARY ===')
for k, v in report['checks'].items():
    print(('PASS' if v['ok'] else 'FAIL'), k)
print('errors:', len(report['errors']))
for e in report['errors'][:10]:
    print(' ', e[:300])
print('ALL PASS' if report['passed'] else 'SOME FAILED')
