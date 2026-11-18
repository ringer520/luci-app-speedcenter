#!/usr/bin/env python3
"""Edge-case checks for the SpeedCenter UI."""
import os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file:///" + os.path.join(ROOT, "preview", "index.html").replace("\\", "/")

results = []
errs = []
def check(name, cond, detail=""):
    results.append(("PASS" if cond else "FAIL", name, detail))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" - {detail}" if detail else ""))

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("console", lambda m: errs.append(f"console.error: {m.text}") if m.type == "error" else None)
    page.goto(URL, wait_until="load")
    page.wait_for_selector(".sc-app")
    time.sleep(0.5)

    # 1. double-click start quickly: should not create two runs / stuck state
    page.click("#sc-start")
    page.click("#sc-start", force=True)
    time.sleep(0.3)
    check("double start keeps single running state", page.locator("#sc-start").is_disabled())
    page.wait_for_function("() => !document.querySelector('#sc-start').disabled", timeout=20000)

    # 2. switch tabs mid-run (start again, jump around rapidly)
    page.click("#sc-start")
    for i in [1, 2, 3, 0, 2, 1, 0]:
        page.locator(".sc-tab").nth(i).click()
        time.sleep(0.1)
    check("tab switching during run survives", page.locator(".sc-app").count() == 1)
    page.wait_for_function("() => !document.querySelector('#sc-start').disabled", timeout=20000)

    # 3. settings with special chars in targets (open raw batch editor inside <details>)
    page.locator(".sc-tab").nth(3).click()
    time.sleep(0.3)
    page.locator(".sc-adv-raw summary").click()
    ta = page.locator("textarea")
    ta.fill('cn,测试"引号,www.example.com,,icmp\nglobal,GitHub,github.com,140.82.114.4,https')
    page.get_by_text("保存设置", exact=True).click()
    time.sleep(0.3)
    check("settings save with special chars", "设置已保存" in (page.locator(".sc-toast").text_content() or ""))

    # 4. history export does not throw with data present
    page.locator(".sc-tab").nth(2).click()
    time.sleep(0.3)
    with page.expect_download(timeout=5000) as dl_info:
        page.get_by_text("导出 CSV").click()
    dl = dl_info.value
    check("CSV export downloads file", dl.suggested_filename.endswith(".csv"), dl.suggested_filename)
    with page.expect_download(timeout=5000) as dl_info2:
        page.get_by_text("导出 JSON").click()
    check("JSON export downloads file", dl_info2.value.suggested_filename.endswith(".json"))

    # 5. theme toggle persists across tab switches (auto -> light -> dark)
    page.locator(".sc-icon-btn").click()
    page.locator(".sc-icon-btn").click()
    page.locator(".sc-tab").nth(1).click()
    page.locator(".sc-tab").nth(0).click()
    check("theme persists across tabs", page.locator(".sc-app").get_attribute("data-theme") == "dark")

    # 6. rapid theme toggling (3-state cycle must stay valid)
    for _ in range(6):
        page.locator(".sc-icon-btn").click()
    check("rapid theme toggle stable", page.locator(".sc-app").get_attribute("data-theme") in ("light", "dark", None))

    # 7. stop button during run
    page.click("#sc-start")
    time.sleep(0.4)
    if not page.locator("#sc-stop").is_disabled():
        page.click("#sc-stop")
        time.sleep(0.3)
        check("stop button works", True)
    else:
        check("stop button works", False, "stop stayed disabled while running")
    b.close()

print("\n=== JS ERRORS ===")
print("  " + ("\n  ".join(errs) if errs else "none"))
fails = [r for r in results if r[0] == "FAIL"]
print(f"\n=== EDGE SUMMARY: {len(results)-len(fails)}/{len(results)} passed, {len(errs)} JS errors ===")
sys.exit(1 if fails or errs else 0)
