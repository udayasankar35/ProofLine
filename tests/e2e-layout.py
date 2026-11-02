"""Layout check: no page scrolls sideways and nothing sticks out of the screen at phone, tablet and laptop widths.
Usage: python3 tests/e2e-layout.py http://localhost:3111"""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3111"
WIDTHS = [(375, 800), (768, 900), (1280, 900)]
OFFENDERS = """() => {
  const w = document.documentElement.clientWidth, out = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > w + 1 && !e.closest('.overflow-x-auto, [data-allow-scroll]')) out.push(e.tagName + '.' + String(e.className).slice(0, 60) + ' right=' + Math.round(r.right));
  }
  return out.slice(0, 5);
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    bad = []
    for w, h in WIDTHS:
        ctx = b.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        page.goto(BASE + "/")
        page.get_by_role("button", name="Enter as Devon").click()
        expect(page).to_have_url(re.compile(r"/drafts$"))
        page.goto(BASE + "/drafts/new")
        page.get_by_role("button", name="Instagram caption (risky)").click()
        page.get_by_role("button", name="Check this draft").click()
        expect(page).to_have_url(re.compile(r"/drafts/D-"))
        draft = page.url
        page.goto(BASE + "/insights")
        load = page.get_by_role("button", name=re.compile("sample history", re.I))
        if load.count(): load.first.click(); page.wait_for_timeout(1200)
        routes = ["/", "/drafts", "/drafts/new", draft, "/review", "/ledger", "/insights", "/knowledge", "/evaluation", "/audit", "/about", "/feedback"]
        for r in routes:
            page.goto(r if r.startswith("http") else BASE + r)
            page.wait_for_timeout(350)
            if page.url.rstrip("/") == BASE and r != "/":   # a role guard sent us home
                continue
            sw = page.evaluate("document.documentElement.scrollWidth")
            cw = page.evaluate("document.documentElement.clientWidth")
            off = page.evaluate(OFFENDERS)
            if sw > cw + 1 or off:
                bad.append((w, r, sw, cw, off))
        # admin-only pages
        page.get_by_role("button", name="Admin", exact=True).click() if page.get_by_role("button", name="Admin", exact=True).count() else None
        page.wait_for_timeout(900)
        for r in ["/knowledge", "/audit", "/review", "/ledger"]:
            page.goto(BASE + r)
            page.wait_for_timeout(350)
            sw = page.evaluate("document.documentElement.scrollWidth")
            cw = page.evaluate("document.documentElement.clientWidth")
            off = page.evaluate(OFFENDERS)
            if sw > cw + 1 or off:
                bad.append((w, "admin " + r, sw, cw, off))
        ctx.close()
    b.close()
for item in bad: print("OVERFLOW", item)
assert not bad, f"{len(bad)} layout problems"
print("layout e2e passed")
