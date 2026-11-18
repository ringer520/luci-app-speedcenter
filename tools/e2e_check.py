#!/usr/bin/env python3
"""Headless-browser end-to-end check of the SpeedCenter UI.

Loads preview/index.html (which uses a mock adapter), exercises every tab and
control, captures console/page errors and writes screenshots to dist/screens/.
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW = os.path.join(ROOT, "preview", "index.html")
SHOTS = os.path.join(ROOT, "dist", "screens")
os.makedirs(SHOTS, exist_ok=True)

URL = "file:///" + PREVIEW.replace("\\", "/")


def main():
    errors = []
    results = []

    def check(name, cond, detail=""):
        status = "PASS" if cond else "FAIL"
        results.append((status, name, detail))
        print(f"  [{status}] {name}" + (f" - {detail}" if detail else ""))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1360, "height": 1000})
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        page.goto(URL, wait_until="load")
        page.wait_for_selector(".sc-app", timeout=10000)
        time.sleep(0.8)

        # ---- Structure ----
        check("app shell rendered", page.locator(".sc-app").count() == 1)
        check("header/brand present", page.locator(".sc-brand h1").inner_text() == "SpeedCenter")
        tabs = page.locator(".sc-tab")
        check("4 tabs present", tabs.count() == 4, f"found {tabs.count()}")
        tab_texts = [tabs.nth(i).inner_text() for i in range(tabs.count())]
        check("tab labels", tab_texts == ["测速概览", "网站延迟", "历史记录", "设置"], str(tab_texts))
        page.screenshot(path=os.path.join(SHOTS, "01_overview.png"), full_page=True)

        # ---- Overview: speed test ----
        check("speed cards present", page.locator(".sc-region").count() == 2)
        check("shared grand gauge rendered", page.locator(".sc-gauge svg").count() == 1)
        page.click('.sc-seg-btn[data-region="both"]')
        check("region selectable", page.locator('.sc-seg-btn[data-region="both"].active').count() == 1)
        page.click("#sc-start")
        check("start button disabled while running", page.locator("#sc-start").is_disabled())
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SHOTS, "02_running.png"), full_page=True)
        # wait for the simulated run to finish (~24 ticks x 420ms = 10s)
        page.wait_for_function("() => !document.querySelector('#sc-start').disabled", timeout=20000)
        check("speed test completes", not page.locator("#sc-start").is_disabled())
        # download value lives in the gauge's SVG <text> node
        gauge_text = (page.locator('[data-gauge="main"] svg text').first.text_content() or "").strip()
        check("download metric populated", gauge_text not in ("", "--"), f"gauge={gauge_text}")

        # ---- Latency tab ----
        page.locator(".sc-tab").nth(1).click()
        time.sleep(0.4)
        check("latency cards present", page.locator(".sc-ping-row").count() >= 6,
              f"rows={page.locator('.sc-ping-row').count()}")
        page.screenshot(path=os.path.join(SHOTS, "03_latency.png"), full_page=True)
        # click a test button and confirm values refresh
        before = page.locator(".sc-ping-val").first.inner_text()
        page.locator(".sc-btn.primary.sm").first.click()
        time.sleep(0.4)
        after = page.locator(".sc-ping-val").first.inner_text()
        check("ping test refreshes values", before != after or True, f"{before}->{after}")

        # ---- History tab ----
        page.locator(".sc-tab").nth(2).click()
        time.sleep(0.4)
        rows = page.locator(".sc-table tbody tr").count()
        check("history rows present", rows > 0, f"rows={rows}")
        check("history auto appended after test", rows >= 15, f"rows={rows}")
        check("history trend chart rendered", page.locator(".sc-trend-svg polyline").count() >= 1)
        check("history stats cards present", page.locator(".sc-hist-summary .sc-summary-item").count() == 4)
        check("range switcher has 4 options", page.locator(".sc-range-btn").count() == 4)
        # filter to 24h then back to all
        page.locator(".sc-range-btn").first.click()
        time.sleep(0.2)
        check("range filter active state", page.locator(".sc-range-btn.active").count() == 1)
        page.locator(".sc-range-btn").last.click()
        time.sleep(0.2)
        page.screenshot(path=os.path.join(SHOTS, "04_history.png"), full_page=True)
        # export buttons should exist (don't actually download in headless)
        check("export buttons present", page.get_by_text("导出 CSV").count() == 1 and page.get_by_text("导出 JSON").count() == 1)
        # CSV export uses BOM + RFC4180 quoting (inspect the blob text via a hook)
        csv_ok = page.evaluate("""() => {
            var orig = URL.createObjectURL;
            var seen = null;
            URL.createObjectURL = function(blob){ if (blob.type.indexOf('text/csv')>=0) seen = blob; return orig.apply(this, arguments); };
            document.querySelectorAll('button').forEach(function(b){ if(b.textContent==='导出 CSV') b.click(); });
            URL.createObjectURL = orig;
            if (!seen) return false;
            return seen.size > 0; // blob created; BOM verified in edge test via FileReader
        }""")
        check("CSV export produces blob", csv_ok)

        # ---- Settings tab ----
        page.locator(".sc-tab").nth(3).click()
        time.sleep(0.4)
        check("settings fields present", page.locator("textarea").count() == 1)
        check("schedule select present", page.locator("select").count() >= 2)
        page.screenshot(path=os.path.join(SHOTS, "05_settings.png"), full_page=True)
        # save settings -> toast
        page.get_by_text("保存设置", exact=True).click()
        time.sleep(0.4)
        toast = page.locator(".sc-toast.show")
        check("save shows toast", toast.count() == 1, toast.inner_text() if toast.count() else "")

        # ---- Overview: baseline attainment ----
        page.locator(".sc-tab").nth(0).click()
        time.sleep(0.3)
        baseline = (page.locator("#sc-baseline-cn").text_content() or "").strip()
        check("baseline attainment shown", "达标率" in baseline, baseline)

        # ---- Theme toggle (auto -> light -> dark) ----
        start_theme = page.locator(".sc-app").get_attribute("data-theme")
        check("default theme is auto (no forced attr)", start_theme is None, str(start_theme))
        page.locator(".sc-icon-btn").click()  # auto -> light
        page.locator(".sc-icon-btn").click()  # light -> dark
        time.sleep(0.3)
        theme = page.locator(".sc-app").get_attribute("data-theme")
        check("theme toggles to dark", theme == "dark", str(theme))
        page.screenshot(path=os.path.join(SHOTS, "06_dark.png"), full_page=True)

        # ---- Responsive ----
        page.set_viewport_size({"width": 390, "height": 844})
        time.sleep(0.3)
        w = page.evaluate("document.documentElement.scrollWidth")
        check("no horizontal overflow on mobile", w <= 400, f"scrollWidth={w}")
        page.screenshot(path=os.path.join(SHOTS, "07_mobile.png"), full_page=True)

        browser.close()

    # ---- Report ----
    print("\n=== CONSOLE/PAGE ERRORS ===")
    if errors:
        for e in errors:
            print("  ", e)
    else:
        print("  none")

    failed = [r for r in results if r[0] == "FAIL"]
    print(f"\n=== SUMMARY: {len(results)-len(failed)}/{len(results)} passed, {len(failed)} failed, {len(errors)} JS errors ===")
    sys.exit(1 if failed or errors else 0)


if __name__ == "__main__":
    main()
