"""배포된 라이브 사이트 검증 — https://sns-autopilot-bin.pages.dev
데스크톱 1440 / 모바일 390에서 생성→카드뉴스→4회/일 큐 흐름과 콘솔 에러·가로 넘침을 확인합니다.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "docs", "screenshots")
URL = os.environ.get("LIVE_URL", "https://sns-autopilot-bin.pages.dev")


def overflow(page, label, issues):
    m = page.evaluate(
        """() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
                   bsw: document.body.scrollWidth, bw: document.body.clientWidth})"""
    )
    if m["sw"] > m["cw"] + 1 or m["bsw"] > m["bw"] + 1:
        issues.append({"view": label, **m})


def main():
    report = {"url": URL, "console_errors": [], "page_errors": [], "overflow": [], "checks": {}, "screenshots": []}
    with sync_playwright() as p:
        browser = p.chromium.launch()

        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: report["console_errors"].append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: report["page_errors"].append(str(e)))
        page.goto(URL + "/", wait_until="networkidle")
        report["checks"]["title"] = page.title()
        overflow(page, "dashboard-1440", report["overflow"])

        # /api/generate 상태 확인 (페이지 컨텍스트에서 실제 fetch)
        report["checks"]["api_health"] = page.evaluate(
            """async () => { const r = await fetch('/api/generate'); return {status: r.status, body: await r.json()}; }"""
        )
        page.screenshot(path=os.path.join(SHOTS, "live-desktop-dashboard-1440.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/live-desktop-dashboard-1440.png")

        page.evaluate("""() => document.querySelector('[data-view="studio"]').click()""")
        page.click('[data-source="coupang"]')
        page.fill("#keywordInput", "무선청소기 추천 순위")
        page.click('[data-goal="affiliate"]')
        page.click('[data-channel="instagram"]')
        page.click('[data-format="cardnews"]')
        page.click("#generateBtn")
        page.wait_for_selector("#resultBody:not([hidden])", timeout=10000)
        report["checks"]["result_title"] = page.inner_text("#resultTitle")
        report["checks"]["result_empty_hidden"] = not page.is_visible("#resultEmpty")
        page.click('[data-view="cardnews"]')
        page.wait_for_selector("#cardGrid canvas", timeout=6000)
        page.wait_for_timeout(400)
        report["checks"]["cardnews_canvases"] = page.locator("#cardGrid canvas").count()
        overflow(page, "cardnews-1440", report["overflow"])
        page.screenshot(path=os.path.join(SHOTS, "live-desktop-cardnews-1440.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/live-desktop-cardnews-1440.png")

        page.evaluate("""() => document.querySelector('[data-view="queue"]').click()""")
        page.click('#queueFreqChips [data-freq="4"]')
        page.click("#fillDayBtn")
        page.wait_for_timeout(600)
        report["checks"]["queue_rows"] = page.locator("#queueList .q-item").count()
        report["checks"]["queue_times"] = page.eval_on_selector_all("#queueList .q-time", "els => els.map(e => e.textContent)")
        overflow(page, "queue-1440", report["overflow"])
        page.screenshot(path=os.path.join(SHOTS, "live-desktop-queue-1440.png"), full_page=True)
        report["screenshots"].append("docs/screenshots/live-desktop-queue-1440.png")
        ctx.close()

        mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mp = mctx.new_page()
        mp.on("console", lambda m: report["console_errors"].append(f"[mobile] {m.text}") if m.type == "error" else None)
        mp.on("pageerror", lambda e: report["page_errors"].append(f"[mobile] {e}"))
        mp.goto(URL + "/", wait_until="networkidle")
        overflow(mp, "dashboard-390", report["overflow"])
        mp.screenshot(path=os.path.join(SHOTS, "live-mobile-dashboard-390.png"))
        report["screenshots"].append("docs/screenshots/live-mobile-dashboard-390.png")
        mp.evaluate("""() => document.querySelector('.mnav[data-view="studio"]').click()""")
        mp.fill("#keywordInput", "연말정산 환급 늘리는 순서")
        mp.click('[data-goal="adsense"]')
        mp.click('[data-channel="blogger"]')
        mp.click("#generateBtn")
        mp.wait_for_selector("#resultBody:not([hidden])", timeout=10000)
        mp.wait_for_timeout(3200)  # 토스트가 사라진 뒤
        mp.evaluate("document.querySelector('#resultBody').scrollIntoView({block:'start'})")
        mp.wait_for_timeout(400)
        overflow(mp, "studio-390", report["overflow"])
        mp.screenshot(path=os.path.join(SHOTS, "live-mobile-studio-390.png"))
        mp.evaluate("document.querySelector('.mnav[data-view=\"cardnews\"]').click()")
        mp.wait_for_selector("#cardGrid canvas", timeout=6000)
        mp.wait_for_timeout(400)
        mp.screenshot(path=os.path.join(SHOTS, "live-mobile-cardnews-390.png"))
        report["screenshots"].append("docs/screenshots/live-mobile-cardnews-390.png")
        report["screenshots"].append("docs/screenshots/live-mobile-studio-390.png")
        mctx.close()
        browser.close()

    report["ok"] = (
        not report["console_errors"]
        and not report["page_errors"]
        and not report["overflow"]
        and report["checks"].get("queue_rows") == 4
        and report["checks"].get("cardnews_canvases", 0) >= 5
        and report["checks"].get("result_empty_hidden") is True
        and report["checks"].get("api_health", {}).get("status") == 200
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
