#!/usr/bin/env python3
"""End-to-end check of standalone/index.html against the mock /ubus server."""
import os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "http://127.0.0.1:8765/standalone/index.html"
SHOTS = os.path.join(ROOT, "dist", "screens")
os.makedirs(SHOTS, exist_ok=True)

results, errs = [], []
def check(name, cond, detail=""):
    results.append(("PASS" if cond else "FAIL", name, detail))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" - {detail}" if detail else ""))

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("console", lambda m: errs.append(f"console.error: {m.text}") if m.type == "error" else None)
    page.goto(URL, wait_until="load")
    time.sleep(0.3)

    # login screen shown when no session
    check("login form visible", page.locator("#login").is_visible())
    page.fill("#user", "root")
    page.fill("#pass", "password")
    page.click("#login-form button[type=submit]")
    page.wait_for_selector(".sc-app", timeout=8000)
    check("login succeeds and app loads", page.locator(".sc-app").count() == 1)
    check("config mapped from ubus", page.locator("#sc-engine").input_value() == "ookla")

    # speed test via real RPC adapter
    page.select_option("#sc-region", "both")
    page.click("#sc-start")
    time.sleep(0.4)
    st = page.evaluate("() => document.querySelector('.sc-pill').textContent")
    check("start calls start RPC", "测速中" in st, st)
    page.click("#sc-stop")
    time.sleep(0.3)

    # latency via RPC
    page.locator(".sc-tab").nth(1).click()
    time.sleep(0.3)
    page.locator(".sc-btn.primary.sm").first.click()
    time.sleep(2.0)   # startPing polls at 1.5s / 3.5s
    rows = page.locator(".sc-ping-row").count()
    check("ping_start RPC + refresh populated targets", rows >= 1, f"rows={rows}")
    page.screenshot(path=os.path.join(SHOTS, "08_standalone.png"), full_page=True)

    # settings save via RPC with theme
    page.locator(".sc-tab").nth(3).click()
    time.sleep(0.3)
    page.get_by_text("保存设置", exact=True).click()
    time.sleep(0.4)
    check("save RPC works", "设置已保存" in (page.locator(".sc-toast").text_content() or ""))
    b.close()

print("\n=== JS ERRORS ===")
print("  " + ("\n  ".join(errs) if errs else "none"))
fails = [r for r in results if r[0] == "FAIL"]
print(f"\n=== STANDALONE SUMMARY: {len(results)-len(fails)}/{len(results)} passed, {len(errs)} JS errors ===")
sys.exit(1 if fails or errs else 0)
