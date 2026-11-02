"""Governance path: evidence ledger, automatic re-flag when evidence expires or is removed, insights, feedback, evaluation.
Usage: python3 tests/e2e-governance.py http://localhost:3111
Feedback is only submitted when the target is localhost, so tester statistics on the live site stay clean."""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3111"
LOCAL = "localhost" in BASE or "127.0.0.1" in BASE
def step(msg): print("  ✓", msg, flush=True)
def url(p): return re.compile(p)

def switch(page, role):
    page.get_by_role("button", name=role, exact=True).click()
    page.wait_for_timeout(900)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)

    # 1. an empty workspace explains itself instead of showing blank tables
    page.goto(BASE + "/")
    page.get_by_role("button", name="Enter as Elena").click()
    expect(page).to_have_url(url(r"/review$"))
    page.goto(BASE + "/ledger")
    expect(page.get_by_role("heading", name="Evidence ledger")).to_be_visible()
    expect(page.get_by_text("No approved pieces yet.")).to_be_visible()
    step("ledger empty state explains what will appear")

    # 2. creator checks a draft that makes one true claim (backed by F-04)
    switch(page, "Creator")
    page.goto(BASE + "/drafts/new")
    page.get_by_label(re.compile("^Title")).fill("Store count post")
    page.get_by_label("Text to check").fill("Find AquaPulse in more than 2,000 stores across India.")
    page.get_by_role("button", name="Check this draft").click()
    expect(page).to_have_url(url(r"/drafts/D-"))
    draft_url = page.url
    claim = page.locator("article", has_text="more than 2,000 stores").first
    expect(claim).to_be_visible()
    expect(claim).to_contain_text("F-04")
    step("true claim found and tied to approved fact F-04")
    page.get_by_role("button", name="Send to review").click()
    expect(page.get_by_text("Waiting for a reviewer")).to_be_visible()

    # 3. reviewer approves
    switch(page, "Reviewer")
    page.goto(draft_url)
    page.get_by_label(re.compile("Note to the author")).fill("Figure matches the March sales report.")
    page.get_by_role("button", name="Approve").click()
    expect(page.get_by_text("Approved by Elena Shah. This is the only state")).to_be_visible()
    expect(page.get_by_text("What stands behind this approved piece")).to_be_visible()
    step("approved; the draft page shows what stands behind it")

    # 4. ledger lists the claim, the fact and the approver
    page.goto(BASE + "/ledger")
    main = page.locator("main")
    for t in ["more than 2,000 stores", "F-04", "Elena Shah", "Evidence valid"]:
        expect(main.get_by_text(t).first).to_be_visible()
    step("ledger shows claim, fact, approver, valid status")

    # 5. admin lets the fact expire: the approved piece is re-flagged automatically
    switch(page, "Admin")
    page.goto(BASE + "/knowledge")
    f04 = page.locator("li", has_text="more than 2,000 stores").first
    original = f04.locator('input[type="date"]').input_value()
    f04.locator('input[type="date"]').fill("2026-01-01")
    f04.get_by_role("button", name="Update date").click()
    expect(page.locator("main [role=status]").first).to_contain_text("re-flagged for re-review")
    expect(page.locator("li", has_text="more than 2,000 stores").first).to_contain_text("used by 1 approved piece")
    step("expiring a fact re-flags the approved piece and says so")

    switch(page, "Reviewer")
    page.goto(BASE + "/review")
    expect(page.get_by_text("Re-review needed (1)")).to_be_visible()
    page.goto(draft_url)
    expect(page.get_by_text("Re-review needed: the evidence behind this approved piece changed.")).to_be_visible()
    page.goto(BASE + "/ledger")
    expect(page.locator("main").get_by_text("Evidence expired").first).to_be_visible()
    step("review queue, draft page and ledger all show the re-flag")

    # 6. putting the date back clears it; visiting twice changes nothing
    switch(page, "Admin")
    page.goto(BASE + "/knowledge")
    f04 = page.locator("li", has_text="more than 2,000 stores").first
    f04.locator('input[type="date"]').fill(original)
    f04.get_by_role("button", name="Update date").click()
    expect(page.locator("main [role=status]").first).to_contain_text("approved again")
    page.reload()
    page.goto(BASE + "/ledger")
    expect(page.locator("main").get_by_text("Evidence valid").first).to_be_visible()
    step("restoring the date clears the re-flag")

    # 7. removing the fact re-flags too, and restoring the demo data brings it back
    page.goto(BASE + "/knowledge")
    f04 = page.locator("li", has_text="more than 2,000 stores").first
    f04.locator("summary", has_text="Edit or remove this fact").click()
    f04.get_by_role("button", name=re.compile(r"^Remove F-04")).click()
    expect(page.locator("main [role=status]").first).to_contain_text("re-flagged")
    page.goto(BASE + "/ledger")
    expect(page.locator("main").get_by_text("Fact removed").first).to_be_visible()
    page.goto(BASE + "/knowledge")
    page.get_by_role("button", name="Restore the original demo guidelines, facts and terms").click()
    page.wait_for_timeout(1200)
    page.goto(BASE + "/review")
    expect(page.get_by_text("Re-review needed")).to_have_count(0)
    step("removing a fact re-flags; restoring the demo data clears it")

    # 8. insights: empty state, sample history, toggle, remove
    page.goto(BASE + "/insights?scope=mine")
    expect(page.get_by_role("heading", name="Governance insights")).to_be_visible()
    page.goto(BASE + "/insights")
    load = page.get_by_role("button", name="Load sample history")
    (load if load.count() else page.get_by_role("button", name="Add fictional sample history")).first.click()
    page.wait_for_timeout(1500)
    for h in ["Most-triggered rules", "Most-disputed findings", "Time to approval", "Facts about to expire"]:
        expect(page.get_by_role("heading", name=h)).to_be_visible()
    expect(page.get_by_text("fictional sample drafts").first).to_be_visible()
    page.get_by_role("link", name="Only my drafts").click()
    page.wait_for_timeout(800)
    expect(page.get_by_text("are hidden in this view")).to_be_visible()
    expect(page.get_by_text(re.compile("^Includes"))).to_have_count(0)
    page.get_by_role("link", name="All drafts").click()
    page.get_by_role("button", name="Remove sample history").click()
    expect(page.locator("main [role=status]").first).to_contain_text("Removed")
    step("insights: sample history loads, 'only my drafts' leaves it out, removal works")

    # 9. evaluation page: regression run
    page.goto(BASE + "/evaluation")
    expect(page.get_by_role("heading", name="Evaluation", exact=True)).to_be_visible()
    expect(page.get_by_text("Nothing is worse than the baseline.")).to_be_visible()
    page.get_by_role("button", name="Run regression now").click()
    expect(page.locator("main [role=status]").first).to_contain_text("nothing is worse than the baseline")
    step("evaluation page: regression run passes against the baseline")

    # 10. feedback (local only)
    page.goto(BASE + "/feedback")
    expect(page.get_by_role("heading", name="Tell us how it went")).to_be_visible()
    if LOCAL:
        # an empty form is stopped by the browser (required radio buttons): nothing is saved, nothing breaks
        page.get_by_role("button", name="Send feedback").click()
        page.wait_for_timeout(600)
        expect(page.get_by_role("heading", name="Tell us how it went")).to_be_visible()
        expect(page.locator("main [role=status]")).to_have_count(0)
        page.get_by_label(re.compile("Yes")).first.check()
        page.locator('input[name="ease"][value="4"]').check()
        page.get_by_label(re.compile("confusing", re.I)).fill("Nothing, e2e test")
        page.get_by_role("button", name=re.compile("send|submit", re.I)).first.click()
        expect(page.locator("main [role=status]").first).to_contain_text("Thank you")
        step("feedback form validates, then saves")
    else:
        step("feedback form renders (not submitted on a live site)")

    assert not errors, errors
    print("governance e2e passed")
    b.close()
