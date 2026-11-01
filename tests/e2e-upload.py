"""Round 3 upload path: image, Word and PDF review, accessibility checks and bad input.
Usage: python3 tests/e2e-upload.py http://localhost:3111 [ai]   (ai = expect the vision model to be available)"""
import re, sys, os
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3111"
AI = len(sys.argv) > 2 and sys.argv[2] == "ai"
SHOTS = os.environ.get("SHOTS", "/tmp/proofline-shots")
os.makedirs(SHOTS, exist_ok=True)

def step(msg): print("  ✓", msg, flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/")
    page.get_by_role("button", name="Enter as Devon").click()
    page.wait_for_url(re.compile(r"/drafts$"))
    page.goto(BASE + "/drafts/new")
    page.get_by_role("button", name="Upload a file or image").click()

    # --- bad input first
    def upload(name, data, mime="application/octet-stream"):
        page.goto(BASE + "/drafts/new?tab=file")
        page.set_input_files("#file", files=[{"name": name, "mimeType": mime, "buffer": data}])
    upload("virus.exe", b"MZ\x90\x00 not a real file")
    page.get_by_role("button", name="Read and check this file").click()
    expect(page.locator("main [role=alert]").first).to_contain_text("not supported")
    step("unsupported file type gives a clear message")
    upload("empty.pdf", b"")
    expect(page.locator("main [role=alert]").first).to_contain_text("empty")
    step("empty file is refused with a message")
    upload("huge.pdf", b"%PDF-1.4\n" + b"0" * (4_300_000), "application/pdf")
    expect(page.locator("main [role=alert]").first).to_contain_text("limit is 4 MB")
    step("oversize file is refused in the browser before upload")
    upload("fake.pdf", b"just text pretending to be a pdf")
    page.get_by_role("button", name="Read and check this file").click()
    expect(page.locator("main [role=alert]").first).to_contain_text("not supported")
    step("a file with the wrong contents is detected by its bytes, not its name")
    upload("old.doc", bytes([0xD0, 0xCF, 0x11, 0xE0]) + b"\x00" * 100)
    page.get_by_role("button", name="Read and check this file").click()
    expect(page.locator("main [role=alert]").first).to_contain_text("old-format")
    step("old Word format explained")

    # --- sample image
    page.goto(BASE + "/drafts/new?tab=file")
    page.get_by_role("button", name="Social tile (image)").click()
    page.wait_for_url(re.compile(r"/drafts/D-"), timeout=90000)
    expect(page.get_by_role("heading", name="Image and accessibility")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/u1-image.png", full_page=True)
    img_url = page.url
    expect(page.locator("article", has_text="Alt text missing")).to_have_count(1)
    expect(page.get_by_role("button", name="Send to review")).to_be_disabled()
    step("image uploaded; missing alt text is a high-risk finding that blocks review")
    if AI:
        expect(page.get_by_text("cures fatigue").first).to_be_visible()
        for t in ["Low text contrast", "Text may be too small", "Colours outside the brand palette", "cures fatigue", "Guaranteed"]:
            assert page.locator("article", has_text=t).count() >= 1, f"missing finding {t}"
        expect(page.locator("article", has_text="Low text contrast").first).to_contain_text("Needs a human check")
        expect(page.get_by_text("AI suggestion")).to_be_visible()
        step("vision findings: contrast, small text, palette, text claims; labelled as needing a human check")
    else:
        expect(page.get_by_text("AI image reader is not available")).to_be_visible()
        step("without AI the page says no text was read and the alt text check still runs")
    # alt text fixes the finding; saving twice is harmless
    page.fill("#alt", "x")
    page.get_by_role("button", name="Save alt text and re-check").click()
    page.wait_for_timeout(1200)
    expect(page.locator("article", has_text="Alt text is not descriptive")).to_have_count(1)
    step("a useless alt text ('x') is still flagged")
    page.fill("#alt", "Navy social tile with the AquaPulse name and a pink band")
    page.get_by_role("button", name="Save alt text and re-check").click()
    page.wait_for_timeout(1200)
    expect(page.locator("article", has_text="R-6")).to_have_count(0)
    step("a descriptive alt text clears the accessibility finding")
    page.fill("#alt", "Energy drink bottle on a navy background")
    page.get_by_role("button", name="Save alt text and re-check").click()
    page.wait_for_timeout(1200)
    expect(page.locator("article", has_text="(in the alt text)").first).to_be_visible()
    step("alt text is also checked against the wording rules (banned term)")

    # --- sample word document
    page.goto(BASE + "/drafts/new?tab=file")
    page.get_by_role("button", name="Press release (Word)").click()
    page.wait_for_url(re.compile(r"/drafts/D-"), timeout=90000)
    expect(page.get_by_role("heading", name="Uploaded file")).to_be_visible()
    expect(page.locator("article", has_text="Image without alt text")).to_have_count(1)
    expect(page.locator("article", has_text="instant").first).to_be_visible()
    expect(page.locator("article", has_text="cheap").first).to_be_visible()
    expect(page.get_by_text("Fixes change this text copy only")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/u2-docx.png", full_page=True)
    step("Word press release: text findings plus an image without alt text")
    # apply a fix on a text finding, original file is untouched
    page.locator("article", has_text="cheap").first.get_by_role("button", name="Apply this fix").click()
    page.wait_for_timeout(1200)
    expect(page.get_by_text("Revision 2").first).to_be_visible()
    step("fix applied to the text copy as revision 2")
    # dispute the decorative image
    art = page.locator("article", has_text="Image without alt text")
    art.get_by_text("Dispute", exact=True).click()
    art.locator("input[name=note]").fill("Decorative banner, no information")
    art.get_by_role("button", name="Save dispute").click()
    page.wait_for_timeout(1200)
    expect(page.get_by_text("Disputed by Devon Rao")).to_be_visible()
    step("decorative image can be disputed with a reason")

    # --- sample pdf
    page.goto(BASE + "/drafts/new?tab=file")
    page.get_by_role("button", name="Flyer (PDF)").click()
    page.wait_for_url(re.compile(r"/drafts/D-"), timeout=90000)
    for t in ["clinically proven", "energy drink"]:
        assert page.locator("article", has_text=t).count() >= 1, f"missing {t}"
    expect(page.get_by_text("Read the text layer of the PDF")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/u3-pdf.png", full_page=True)
    step("PDF text layer read without AI; claims and wording flagged")

    # --- original file download works and is private
    href = page.locator("a", has_text="Open the original").get_attribute("href")
    r = page.request.get(BASE + href)
    assert r.status == 200 and r.headers["content-type"] == "application/pdf"
    other = b.new_context().request.get(BASE + href)
    assert other.status == 404
    step("original is downloadable by its owner and 404 for everyone else")

    # --- upload twice does not break anything
    page.goto(BASE + "/drafts")
    expect(page.locator("a[href^='/drafts/D-']")).to_have_count(3)
    step("three drafts listed")
    assert not errors, errors
    print("UPLOAD PATH OK")
    b.close()
