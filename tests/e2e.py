"""End-to-end check of the core judge path. Usage: python3 tests/e2e.py http://localhost:3111 [expect_ai]
Needs: pip install playwright (Chromium installed). Run against any ProofLine deployment."""
import re, sys, os
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3111"
EXPECT_AI = len(sys.argv) > 2 and sys.argv[2] == "ai"
SHOTS = os.environ.get("SHOTS", "/tmp/proofline-shots")
os.makedirs(SHOTS, exist_ok=True)

def step(msg): print("  ✓", msg, flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # 1. landing + enter as creator
    page.goto(BASE + "/")
    expect(page.get_by_role("heading", name="No claim goes live without a source.")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/01-landing.png", full_page=True)
    # start from a known state: admin restores the shared demo guidelines and facts
    page.get_by_role("button", name="Enter as Asha").click()
    page.wait_for_url(re.compile(r"/knowledge$"))
    page.get_by_role("button", name="Restore the original demo guidelines, facts and terms").click()
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Creator").click()
    page.wait_for_url(re.compile(r"/drafts$"))
    step("entered the demo (admin reset the data, then Devon the creator)")

    # 2. new draft from sample, run check
    page.get_by_role("link", name="Create your first draft").click()
    page.get_by_role("button", name="Instagram caption (risky)").click()
    page.get_by_role("button", name="Check this draft").click()
    page.wait_for_url(re.compile(r"/drafts/D-"))
    draft_url = page.url
    step("draft checked: " + draft_url.split("/")[-1])
    body = page.get_by_role("heading", name="Findings")
    expect(body).to_be_visible()
    for text in ["cures fatigue", "#1", "Guaranteed", "100%", "INSANE", "Required disclaimer"]:
        assert page.locator("article", has_text=text).count() >= 1, f"missing finding for {text}"
    expect(page.locator("article", has_text="#1").first).to_contain_text("Outdated evidence")
    expect(page.get_by_text("Last check")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/02-findings.png", full_page=True)
    step("risky caption flagged: medical, #1 outdated, guarantee, 100%, caps, disclaimer")
    if EXPECT_AI:
        expect(page.get_by_text("AI-assisted check")).to_be_visible()
        step("AI-assisted check label shown")
    else:
        expect(page.get_by_text("Rules-only check")).to_be_visible()
        step("rules-only label shown")

    # 3. submit is blocked while high-risk findings are open
    send = page.get_by_role("button", name="Send to review")
    expect(send).to_be_disabled()
    expect(page.get_by_text(re.compile(r"high-risk finding"))).to_be_visible()
    step("send-to-review blocked while high-risk findings are open")

    # 4. apply the medical-wording fix and check the rewrite uses fact F-12
    card = page.locator("article", has_text="Medical or cure wording").first
    card.get_by_role("button", name="Apply this fix").click()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("helps replace electrolytes lost through sweat").first).to_be_visible()
    expect(page.get_by_text(re.compile(r"Instagram · revision 2"))).to_be_visible()
    step("accepted fix created revision 2 with the approved F-12 wording")

    # 5. dispute one finding with a reason
    card = page.locator("article", has_text="Preferred wording").first if page.locator("article", has_text="Preferred wording").count() else page.locator("article", has_text="Banned term").first
    card.locator("summary", has_text="Dispute").click()
    card.get_by_label(re.compile("Why is this finding")).fill("Campaign tone approved by the brand team")
    card.get_by_role("button", name="Save dispute").click()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Disputed by Devon Rao").first).to_be_visible()
    step("disputed a finding with a reason")

    # 6. resolve the remaining high-risk findings (apply fix, or dispute if manual)
    for _ in range(12):
        pending = [a for a in page.locator("article").all() if a.get_by_text("High risk", exact=True).count() and a.get_by_role("button", name="Apply this fix").count()]
        if pending:
            pending[0].get_by_role("button", name="Apply this fix").click()
            page.wait_for_load_state("networkidle")
            continue
        manual = [a for a in page.locator("article").all() if a.get_by_text("High risk", exact=True).count() and a.locator("summary", has_text="Dispute").count()]
        if manual:
            manual[0].locator("summary", has_text="Dispute").click()
            manual[0].get_by_label(re.compile("Why is this finding")).fill("Will be rewritten with the sourced figure before posting")
            manual[0].get_by_role("button", name="Save dispute").click()
            page.wait_for_load_state("networkidle")
            continue
        break
    expect(page.get_by_role("button", name="Send to review")).to_be_enabled()
    page.screenshot(path=f"{SHOTS}/03-resolved.png", full_page=True)
    step("all high-risk findings resolved; send-to-review enabled")

    # 7. send to review, then reviewer approves
    page.get_by_role("button", name="Send to review").click()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Waiting for a reviewer")).to_be_visible()
    step("sent to review")
    page.get_by_role("button", name="Reviewer").click()
    page.wait_for_url(re.compile(r"/review$"))
    expect(page.get_by_text("Waiting for review (1)")).to_be_visible()
    page.get_by_role("link", name=re.compile("Launch week caption")).click()
    expect(page.get_by_role("button", name="Approve")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/04-reviewer.png", full_page=True)
    # changes need a note
    page.get_by_role("button", name="Request changes").click()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Tell the author what to change")).to_be_visible()
    page.get_by_label(re.compile("Note to the author")).fill("Looks good. Approving.")
    page.get_by_role("button", name="Approve").click()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Approved by a human reviewer")).to_be_visible()
    step("reviewer approved (and 'request changes' demanded a note)")

    # 8. creator cannot touch an approved draft
    page.get_by_role("button", name="Creator").click()
    page.wait_for_url(re.compile(r"/drafts$"))
    page.goto(draft_url)
    expect(page.get_by_role("button", name="Send to review")).to_have_count(0)
    step("approved draft is locked for the creator")

    # 9. admin changes a fact's expiry, new check reflects it
    page.get_by_role("button", name="Admin").click()
    page.wait_for_url(re.compile(r"/knowledge$"))
    f07 = page.locator("li", has_text="ranked #1").first
    expect(f07).to_contain_text("Expired")
    f07.locator('input[type="date"]').fill("2027-12-31")
    f07.get_by_role("button", name="Update date").click()
    page.wait_for_load_state("networkidle")
    expect(page.locator("li", has_text="ranked #1").first).to_contain_text("In date")
    page.screenshot(path=f"{SHOTS}/05-knowledge.png", full_page=True)
    step("admin renewed fact F-07")
    # new draft with the same text: #1 is now supported (rules-only matcher) or supported by AI
    page.get_by_role("button", name="Creator").click()
    page.wait_for_url(re.compile(r"/drafts$"))
    page.goto(BASE + "/drafts/new")
    page.get_by_role("button", name="Instagram caption (risky)").click()
    page.get_by_role("button", name="Check this draft").click()
    page.wait_for_url(re.compile(r"/drafts/D-"))
    rank = page.locator("article", has_text="Ranking claim").first
    expect(rank).to_contain_text("Supported")
    step("with F-07 renewed, the #1 claim flips to Supported")
    # restore demo data
    page.get_by_role("button", name="Admin").click()
    page.wait_for_url(re.compile(r"/knowledge$"))
    page.get_by_role("button", name="Restore the original demo guidelines, facts and terms").click()
    page.wait_for_load_state("networkidle")
    expect(page.locator("li", has_text="ranked #1").first).to_contain_text("Expired")
    step("demo data restored")

    # 10. audit trail + report
    page.goto(BASE + "/audit")
    for t in ["Draft created", "Check run", "Fix applied", "Finding disputed", "Sent to review", "Approved", "Fact expiry changed"]:
        expect(page.get_by_text(t).first).to_be_visible()
    page.screenshot(path=f"{SHOTS}/06-audit.png", full_page=True)
    step("audit trail records every step")
    r = ctx.request.get(draft_url + "/report")
    assert r.status == 200 and "ProofLine check report" in r.text()
    step("report downloads")

    # 11. isolation: a fresh browser must not see this session's drafts
    ctx2 = b.new_context()
    p2 = ctx2.new_page()
    p2.goto(BASE + "/")
    p2.get_by_role("button", name="Enter as Devon").click()
    p2.wait_for_url(re.compile(r"/drafts$"))
    expect(p2.get_by_text("No drafts yet in this session")).to_be_visible()
    resp = p2.goto(draft_url)
    assert resp.status == 404, f"expected 404 for another session's draft, got {resp.status}"
    step("another visitor cannot see or open these drafts")

    # 12. mobile layout has no horizontal scroll
    m = b.new_context(viewport={"width": 390, "height": 800})
    mp = m.new_page()
    mp.goto(BASE + "/")
    mp.get_by_role("button", name="Enter as Devon").click()
    mp.get_by_role("link", name="Create your first draft").click()
    mp.get_by_role("button", name="Press note (outdated figure)").click()
    mp.get_by_role("button", name="Check this draft").click()
    mp.wait_for_url(re.compile(r"/drafts/D-"))
    overflow = mp.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    mp.screenshot(path=f"{SHOTS}/07-mobile.png", full_page=True)
    assert not overflow, "page scrolls sideways on mobile"
    step("mobile 390px: no sideways scroll")

    real_errors = [e for e in errors if "favicon" not in e.lower() and "404" not in e]
    assert not real_errors, f"browser errors: {real_errors[:3]}"
    step("no browser console errors")
    b.close()
print("E2E PASSED")
