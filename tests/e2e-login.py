"""Demo sign-in: credentials are visible on the home page, typed sign-in works, bad input is handled calmly.
Usage: python3 tests/e2e-login.py http://localhost:3111"""
import re
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3111"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # visiting a private page when signed out explains what to do
    page.goto(f"{BASE}/drafts")
    expect(page.locator("main [role=status]").first).to_contain_text("sign in with one of the demo accounts")

    # the credentials are on the page
    for email in ["devon@aquapulse.demo", "elena@aquapulse.demo", "asha@aquapulse.demo"]:
        expect(page.get_by_text(email)).to_be_visible()
    expect(page.get_by_text("proofline-demo").first).to_be_visible()

    # the eye button shows and hides what was typed
    pw = page.get_by_label("Password", exact=True)
    pw.fill("proofline-demo")
    expect(pw).to_have_attribute("type", "password")
    page.get_by_role("button", name="Show password").click()
    expect(pw).to_have_attribute("type", "text")
    page.get_by_role("button", name="Hide password").click()
    expect(pw).to_have_attribute("type", "password")
    pw.fill("")
    # wrong password: calm error, still on the home page
    page.get_by_label("Email").fill("devon@aquapulse.demo")
    page.get_by_label("Password", exact=True).fill("wrong")
    page.get_by_role("button", name="Sign in").click()
    expect(page.locator("main [role=alert]").first).to_contain_text("do not match a demo account")
    expect(page.get_by_label("Password", exact=True)).to_have_value("")  # the form is reset once the action has finished
    assert urlparse(page.url).path == "/", page.url

    # unknown email
    page.get_by_label("Email").fill("nobody@example.com")
    page.get_by_label("Password", exact=True).fill("proofline-demo")
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_timeout(1500)  # same message as before, so wait for the action to finish
    expect(page.locator("main [role=alert]").first).to_contain_text("do not match a demo account")
    expect(page.get_by_label("Password", exact=True)).to_have_value("")

    # correct credentials, with different capitalisation and spaces in the email
    page.get_by_label("Email").fill("  Elena@AquaPulse.demo ")
    page.get_by_label("Password", exact=True).fill("proofline-demo")
    page.get_by_role("button", name="Sign in").click()
    expect(page).to_have_url(re.compile(r"/review$"))
    expect(page.get_by_role("heading", name="Review queue")).to_be_visible()

    # leave and sign in as the creator
    page.get_by_role("button", name="Leave demo").click()
    expect(page).to_have_url(re.compile(r"/$"))
    page.get_by_label("Email").fill("devon@aquapulse.demo")
    page.get_by_label("Password", exact=True).fill("proofline-demo")
    page.get_by_role("button", name="Sign in").click()
    expect(page).to_have_url(re.compile(r"/drafts$"))

    # one click still works
    page.get_by_role("button", name="Leave demo").click()
    page.get_by_role("button", name="Enter as Asha").click()
    expect(page).to_have_url(re.compile(r"/knowledge$"))

    real = [e for e in errors if "404" not in e]
    assert not real, real
    print("login e2e passed")
    b.close()
