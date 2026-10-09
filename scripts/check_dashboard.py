"""Verify compact dashboard joins and navigation against live sheets."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

output = Path('output/dashboard')
output.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width':1280,'height':850})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173')
    expect(page.locator('tbody tr')).to_have_count(7, timeout=45000)
    expect(page.locator('thead th')).to_have_count(6)
    assert page.locator('thead th').last.inner_text().lower().startswith('season total')
    row = page.locator('tbody tr').filter(has_text='boston.rob')
    assert [cell.strip() for cell in row.locator('td').all_text_contents()] == ['5','boston.rob','+76','+57','+13','+146']
    page.screenshot(path=str(output/'desktop.png'),full_page=True)
    row.get_by_role('button',name='boston.rob, Episode 3 - 10/7',exact=True).click()
    expect(page.locator('tbody tr')).to_have_count(5)
    assert 'Patt' in page.locator('tbody').inner_text()
    page.get_by_label('Member',exact=True).select_option('')
    expect(page.locator('tbody tr')).to_have_count(21)
    assert page.locator('tbody').get_by_text('Not picked',exact=True).count() > 0
    assert page.locator('.chips .shared').count() > 0
    expect(page.get_by_role('button',name='Next episode')).to_be_disabled()
    page.get_by_role('button',name='Previous episode').click()
    expect(page.locator('.week-switch strong')).to_have_text('Episode 2 - 9/30')
    page.screenshot(path=str(output/'weekly.png'),full_page=True)
    page.get_by_role('button',name='Contestants',exact=True).click()
    expect(page.locator('tbody tr')).to_have_count(21)
    expect(page.locator('thead th')).to_have_count(9)
    row=page.locator('tbody tr').filter(has_text='Linnea')
    cells=row.locator('td').all_text_contents()
    assert int(cells[-1].replace('+','')) == sum(int(c.replace('+','')) for c in cells[5:8] if c!='—')
    row.get_by_role('button',name='Linnea, Episode 3 - 10/7',exact=True).click()
    expect(page.get_by_label('Episode',exact=True)).to_have_value('Episode 3 - 10/7')
    expect(page.get_by_label('Contestant',exact=True)).to_have_value('Linnea')
    assert page.locator('tbody tr').count()==5
    page.get_by_role('button',name='View scoring rules',exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.locator('dialog tbody tr')).to_have_count(42)
    page.get_by_label('Search rules',exact=True).fill('immunity')
    assert 0 < page.locator('dialog tbody tr').count() < 42
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_role('button',name='View scoring rules')).to_be_focused()
    page.get_by_role('button',name='Scoreboard',exact=True).click()
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(output/'mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.route('https://docs.google.com/**',lambda route:route.abort())
    page.get_by_role('button',name='Refresh',exact=True).click()
    expect(page.get_by_role('alert')).to_be_visible(timeout=30000)
    expect(page.locator('tbody tr')).to_have_count(7)
    assert not errors,errors
    browser.close()
print('Episode pivots, totals, shared/unpicked contestants, navigation, rules dialog, mobile, and refresh failure passed.')
