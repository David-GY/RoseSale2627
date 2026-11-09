"""Run against the already started, local demo server. Uses only placeholder data."""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:3010"
OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
results = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1050})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    assert context.request.get(BASE + "/api/admin/dashboard").status == 401
    assert context.request.post(BASE + "/api/responses", data={}, headers={"Origin": "https://example.com"}).status == 403
    assert context.request.post(BASE + "/api/responses", data={}, headers={"Origin": BASE,"Content-Type":"application/json"}).status == 401
    page.goto(BASE)
    expect(page.get_by_role("heading", name="Your time makes it bloom.")).to_be_visible()
    expect(page.get_by_role("button", name="Try Ana’s availability")).to_be_visible()
    page.screenshot(path=str(OUT / "member-desktop.png"), full_page=True)
    page.get_by_role("button", name="Try Ana’s availability").click()
    expect(page.get_by_role("heading", name="When can you lend a hand?")).to_be_visible()
    page.get_by_role("button", name="Clear all", exact=True).click()
    cell = page.locator("[data-slot='D1S1']")
    cell.click()
    expect(cell).to_have_attribute("aria-pressed", "true")
    cell.focus()
    page.keyboard.press("Space")
    expect(cell).to_have_attribute("aria-pressed", "false")
    page.keyboard.press("Space")
    expect(cell).to_have_attribute("aria-pressed", "true")
    # Drag into the next two slots without relying on implementation functions.
    box = cell.bounding_box()
    target = page.locator("[data-slot='D1S3']").bounding_box()
    page.mouse.move(box["x"] + box["width"]/2, box["y"] + box["height"]/2)
    page.mouse.down()
    page.mouse.move(target["x"] + target["width"]/2, target["y"] + target["height"]/2, steps=20)
    page.mouse.up()
    expect(page.locator("[data-slot='D1S3']")).to_have_attribute("aria-pressed", "false")
    page.locator("#pref-0").select_option("SUPERVISOR")
    page.locator("#notes").fill("Desktop browser smoke")
    page.get_by_role("button", name="Save availability").click()
    expect(page.get_by_role("status").filter(has_text="Availability saved")).to_be_visible()
    page.reload()
    expect(page.locator("#notes")).to_have_value("Desktop browser smoke")
    page.screenshot(path=str(OUT / "availability-desktop.png"), full_page=True)
    results["desktop_submit_edit_restore_keyboard_drag"] = True

    mobile = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True, device_scale_factor=1)
    phone = mobile.new_page()
    phone.on("pageerror", lambda e: errors.append(str(e)))
    phone.goto(BASE)
    phone.locator("#student-id").fill("1048")
    phone.get_by_role("button", name="Find my availability").click()
    expect(phone.get_by_role("heading", name="When can you lend a hand?")).to_be_visible()
    phone.locator("[data-slot='D1S1']").tap()
    phone.get_by_role("button", name="Next day", exact=True).click()
    phone.locator("[data-slot='D2S2']").tap()
    phone.locator("#pref-0").select_option("BLOOMBAR")
    phone.locator("#notes").fill("Mobile touch smoke")
    phone.get_by_role("button", name="Save availability").click()
    expect(phone.get_by_role("status").filter(has_text="Availability saved")).to_be_visible()
    assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile layout overflows"
    phone.screenshot(path=str(OUT / "availability-mobile.png"), full_page=True)
    results["mobile_touch_submit"] = True

    admin = context.new_page()
    admin.on("pageerror", lambda e: errors.append(str(e)))
    admin.goto(BASE + "/admin")
    admin.locator("#passcode").fill("rose-demo")
    admin.get_by_role("button", name="Open workspace").click()
    expect(admin.get_by_role("button", name="Close member form")).to_be_visible()
    admin.get_by_role("tab", name="Responses").click()
    expect(admin.get_by_role("heading", name="Every helping hand.")).to_be_visible()
    admin.get_by_role("tab", name="Coverage heatmap").click()
    expect(admin.get_by_role("heading", name="A view of what’s possible.")).to_be_visible()
    admin.get_by_role("button", name="Close member form").click()
    expect(admin.get_by_role("button", name="Reopen member form")).to_be_visible()
    start=time.monotonic()
    with admin.expect_response(lambda r: "/api/admin/assign" in r.url, timeout=60000) as response:
        admin.get_by_role("button", name="Run auto-assign").click()
    preview=response.value.json()
    assert response.value.ok, preview
    expect(admin.get_by_role("heading", name="A first look at the week.")).to_be_visible()
    results["solve"]={"seconds":round(time.monotonic()-start,2), "method":preview["run"]["method"], "stats":preview["run"]["stats"],"warnings":preview["run"]["warnings"]}
    assert preview["run"]["method"] in ["optimal","feasible"], preview["run"]["warnings"]
    pin=admin.get_by_role("button",name="Pin ",exact=False).first
    pin.click()
    assert admin.get_by_role("button",name="Publish to demo").is_disabled()
    with admin.expect_response(lambda r:"/api/admin/assign" in r.url,timeout=60000) as response2:
        admin.get_by_role("button",name="Run auto-assign").click()
    rerun=response2.value.json()
    assert any(a["locked"] for a in rerun["run"]["assignments"])
    expect(admin.get_by_role("checkbox")).to_be_visible()
    admin.get_by_role("checkbox").check()
    admin.screenshot(path=str(OUT / "admin-preview-desktop.png"), full_page=True)
    admin.get_by_role("button",name="Publish to demo").click()
    expect(admin.get_by_role("heading",name="The published schedule.")).to_be_visible(timeout=30000)
    state=context.request.get(BASE+"/api/admin/dashboard").json()
    assert len(state["assignments"])==len(rerun["run"]["assignments"])
    assert any(a["locked"] for a in state["assignments"])
    admin.get_by_role("button",name="Reopen member form").click()
    expect(admin.get_by_role("button",name="Close member form")).to_be_visible()
    results["admin_responses_heatmap_pin_rerun_publish"] = True
    assert not errors, errors
    results["browser_errors"] = errors
    (OUT/"browser-results.json").write_text(json.dumps(results,indent=2),encoding="utf8")
    print(json.dumps(results,indent=2))
    browser.close()
