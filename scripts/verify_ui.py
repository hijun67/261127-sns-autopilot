"""SNS 오토파일럿 UI 검증 — 로컬 정적 서버 + Chromium(Playwright).
소스 → 목표 → 생성 → 카드뉴스 → 스케줄 4회/일 큐 → 승인 흐름을 실제 브라우저로 확인하고
콘솔 에러·가로 넘침을 수집한 뒤, 데스크톱(1440) / 모바일(390) 스크린샷을 저장합니다.
"""
import json
import os
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
SHOTS = os.path.join(ROOT, "docs", "screenshots")
os.makedirs(SHOTS, exist_ok=True)

PORT = 4173
BASE = f"http://127.0.0.1:{PORT}"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = partial(QuietHandler, directory=PUBLIC)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def overflow(page, label, issues):
    m = page.evaluate(
        """() => ({
            sw: document.documentElement.scrollWidth,
            cw: document.documentElement.clientWidth,
            bsw: document.body.scrollWidth,
            bw: document.body.clientWidth,
        })"""
    )
    if m["sw"] > m["cw"] + 1 or m["bsw"] > m["bw"] + 1:
        issues.append({"view": label, **m})
    return m


def main():
    httpd = serve()
    report = {
        "url": BASE,
        "console_errors": [],
        "page_errors": [],
        "failed_requests": [],
        "overflow": [],
        "checks": {},
        "screenshots": [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--font-render-hinting=none"])

        # ---------------- 데스크톱 1440 ----------------
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("console", lambda m: report["console_errors"].append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: report["page_errors"].append(str(e)))
        page.on("requestfailed", lambda r: report["failed_requests"].append(f"{r.url} :: {r.failure}"))

        page.goto(BASE + "/", wait_until="networkidle")
        report["checks"]["title"] = page.title()
        overflow(page, "dashboard-1440", report["overflow"])
        page.screenshot(path=os.path.join(SHOTS, "desktop-dashboard-1440.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/desktop-dashboard-1440.png")

        # 스튜디오: 쿠팡 파트너스 → 판매수수료 → Instagram → 카드뉴스
        page.evaluate("""() => document.querySelector('[data-view="studio"]').click()""")
        page.wait_for_timeout(250)
        page.click('[data-source="coupang"]')
        page.fill("#keywordInput", "무선청소기 추천 순위")
        page.click('[data-goal="affiliate"]')
        page.click('[data-channel="instagram"]')
        page.click('[data-format="cardnews"]')
        page.click("#generateBtn")
        page.wait_for_selector("#resultBody:not([hidden])", timeout=8000)
        report["checks"]["result_title"] = page.inner_text("#resultTitle")
        report["checks"]["result_mode"] = page.inner_text("#resultMode")
        report["checks"]["disclosure_shown"] = page.is_visible("#disclosureNote")

        # 블로그 탭에 공정위 문구 포함 확인
        page.click('#resultTabs [data-tab="blog"]')
        page.wait_for_timeout(150)
        blog_text = page.inner_text("#tabPanels")
        report["checks"]["blog_has_disclosure"] = "수수료를 제공받습니다" in blog_text

        # 카드뉴스 탭
        page.click('#resultTabs [data-tab="cardnews"]')
        page.wait_for_timeout(150)
        report["checks"]["cardnews_slide_lines"] = page.locator("#tabPanels .mini-list li").count()
        overflow(page, "studio-1440", report["overflow"])
        page.screenshot(path=os.path.join(SHOTS, "desktop-studio-1440.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/desktop-studio-1440.png")

        # 카드뉴스 화면 (캔버스 렌더 확인)
        page.evaluate("""() => document.querySelector('[data-view="cardnews"]').click()""")
        page.wait_for_selector("#cardGrid canvas", timeout=5000)
        page.wait_for_timeout(400)
        canvas_count = page.locator("#cardGrid canvas").count()
        report["checks"]["cardnews_canvases"] = canvas_count
        # 캔버스가 실제로 그려졌는지(픽셀 비어있지 않은지) 확인
        painted = page.evaluate(
            """() => {
                const c = document.querySelector('#cardGrid canvas');
                const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let n = 0;
                for (let i = 3; i < d.length; i += 4) { if (d[i] > 0) n++; }
                return n / (c.width * c.height);
            }"""
        )
        report["checks"]["cardnews_pixel_coverage"] = round(painted, 3)
        overflow(page, "cardnews-1440", report["overflow"])
        page.screenshot(path=os.path.join(SHOTS, "desktop-cardnews-1440.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/desktop-cardnews-1440.png")

        # 스케줄 4회/일 → 큐 채우기
        page.evaluate("""() => document.querySelector('[data-view="queue"]').click()""")
        page.wait_for_timeout(200)
        page.click('#queueFreqChips [data-freq="4"]')
        page.click("#fillDayBtn")
        page.wait_for_timeout(500)
        rows = page.locator("#queueList .q-item").count()
        report["checks"]["queue_rows"] = rows
        report["checks"]["queue_times"] = page.eval_on_selector_all(
            "#queueList .q-time", "els => els.map(e => e.textContent)"
        )
        overflow(page, "queue-1440", report["overflow"])
        page.screenshot(path=os.path.join(SHOTS, "desktop-queue-1440.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/desktop-queue-1440.png")

        # 승인 → 발행 처리 상태 전이
        page.click('#queueList .q-item [data-act="approved"]')
        page.wait_for_timeout(200)
        approved = page.locator("#queueList .status-badge.approved").count()
        page.click('#queueList .q-item [data-act="published"]')
        page.wait_for_timeout(200)
        published = page.locator("#queueList .status-badge.published").count()
        report["checks"]["approved_badges"] = approved
        report["checks"]["published_badges"] = published

        # 라이트 모드
        page.evaluate("""() => document.querySelector('[data-view="dashboard"]').click()""")
        page.click("#themeBtn")
        page.wait_for_timeout(300)
        overflow(page, "dashboard-light-1440", report["overflow"])
        page.screenshot(path=os.path.join(SHOTS, "desktop-dashboard-light-1440.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/desktop-dashboard-light-1440.png")

        # 새로고침 후 localStorage 유지 확인
        page.reload(wait_until="networkidle")
        report["checks"]["persisted_queue_after_reload"] = page.evaluate(
            """() => JSON.parse(localStorage.getItem('sns-autopilot-state-v1') || '{}').queue?.length || 0"""
        )
        ctx.close()

        # ---------------- 모바일 390 ----------------
        mctx = browser.new_context(
            viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True
        )
        mp = mctx.new_page()
        mp.on("console", lambda m: report["console_errors"].append(f"[mobile] {m.text}") if m.type == "error" else None)
        mp.on("pageerror", lambda e: report["page_errors"].append(f"[mobile] {e}"))
        mp.goto(BASE + "/", wait_until="networkidle")
        overflow(mp, "dashboard-390", report["overflow"])
        mp.screenshot(path=os.path.join(SHOTS, "mobile-dashboard-390.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/mobile-dashboard-390.png")

        mp.evaluate("""() => document.querySelector('.mnav[data-view="studio"]').click()""")
        mp.wait_for_timeout(200)
        mp.fill("#keywordInput", "연말정산 환급 늘리는 순서")
        mp.click('[data-goal="adsense"]')
        mp.click('[data-channel="blogger"]')
        mp.click("#generateBtn")
        mp.wait_for_selector("#resultBody:not([hidden])", timeout=8000)
        overflow(mp, "studio-390", report["overflow"])
        mp.screenshot(path=os.path.join(SHOTS, "mobile-studio-390.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/mobile-studio-390.png")

        mp.evaluate("""() => document.querySelector('.mnav[data-view="queue"]').click()""")
        mp.wait_for_timeout(200)
        mp.click('#queueFreqChips [data-freq="4"]')
        mp.click("#fillDayBtn")
        mp.wait_for_timeout(500)
        report["checks"]["mobile_queue_rows"] = mp.locator("#queueList .q-item").count()
        overflow(mp, "queue-390", report["overflow"])
        mp.screenshot(path=os.path.join(SHOTS, "mobile-queue-390.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/mobile-queue-390.png")

        mp.evaluate("""() => document.querySelector('.mnav[data-view="cardnews"]').click()""")
        mp.wait_for_selector("#cardGrid canvas", timeout=5000)
        mp.wait_for_timeout(400)
        overflow(mp, "cardnews-390", report["overflow"])
        mp.screenshot(path=os.path.join(SHOTS, "mobile-cardnews-390.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/mobile-cardnews-390.png")

        mctx.close()
        browser.close()

    httpd.shutdown()

    report["ok"] = (
        not report["console_errors"]
        and not report["page_errors"]
        and not report["overflow"]
        and report["checks"].get("queue_rows") == 4
        and report["checks"].get("cardnews_canvases", 0) >= 5
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
