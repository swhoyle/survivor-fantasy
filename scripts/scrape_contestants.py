"""Fetch Survivor contestants and optionally replace the Contestants sheet."""
import argparse
import csv
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://fantasy.bracketology.tv/survivor/contestants'
HEADERS = ['Name', 'Tribe', 'Age', 'Hometown', 'Occupation']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--headed', action='store_true')
    parser.add_argument('--update-sheet', action='store_true')
    args = parser.parse_args()
    load_dotenv(ROOT / '.env')
    output = ROOT / 'output/contestants'
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        try:
            response = page.goto(URL, wait_until='domcontentloaded', timeout=60000)
            print(f'Navigated to {page.url} (HTTP {response.status if response else "unknown"}).', flush=True)
            try:
                page.wait_for_function(
                    "document.body && (document.body.innerText.length > 200 || document.querySelector('input[type=password]'))",
                    timeout=60000,
                )
            except Exception:
                title = page.title()
                body = page.locator('body').inner_text()[:2000]
                for secret in (os.getenv('BRACKETOLOGY_USERNAME'), os.getenv('BRACKETOLOGY_PASSWORD')):
                    if secret:
                        body = body.replace(secret, '[redacted]')
                (output / 'failure.txt').write_text(
                    f'URL: {page.url}\nTitle: {title}\nHTTP status: {response.status if response else "unknown"}\n\n{body}',
                    encoding='utf-8',
                )
                page.screenshot(path=str(output / 'failure.png'), full_page=True)
                print(f'Page did not render expected content. URL={page.url}; title={title}; diagnostics saved under {output.relative_to(ROOT)}.', flush=True)
                raise
            if page.locator('input[type=password]').is_visible():
                username, password = os.getenv('BRACKETOLOGY_USERNAME'), os.getenv('BRACKETOLOGY_PASSWORD')
                if not username or not password:
                    raise RuntimeError('Missing credentials in .env')
                page.locator('input[type=email]').fill(username)
                page.locator('input[type=password]').fill(password)
                page.get_by_role('button', name='Confirm', exact=True).click()
                page.get_by_text('Welcome back!', exact=True).wait_for()
                survivor = page.get_by_text('Survivor', exact=True)
                survivor.locator('xpath=ancestor::*[.//*[normalize-space(text())="Play"]][1]').get_by_text('Play', exact=True).click()
                page.wait_for_url(re.compile('/survivor'))
                page.goto(URL, wait_until='domcontentloaded')
                print('Logged in and opened contestants.', flush=True)
            page.locator('.contestant-card').first.wait_for()
            page.locator('.center-content [role=progressbar]').wait_for(state='hidden')
            cards = page.locator('.contestant-card').evaluate_all("cards => cards.map(card => Array.from(card.querySelectorAll('p'), p => p.innerText.trim()))")
            contestants = []
            for fields in cards:
                if len(fields) != 3:
                    raise RuntimeError('Unexpected contestant card layout; sheet was not changed')
                match = re.fullmatch(r'(.+?)\s*\(([^()]*)\)\s*\((\d+)\)', fields[0])
                if not match:
                    raise RuntimeError('Could not parse contestant name, tribe, and age')
                name, tribe, age = match.groups()
                contestants.append(dict(zip(HEADERS, [name.strip(), tribe.strip(), int(age), fields[1], fields[2]])))
            if not contestants or len({person['Name'] for person in contestants}) != len(contestants):
                raise RuntimeError('Empty or duplicate contestant list; sheet was not changed')
            snapshot = {'source_url': URL, 'extracted_at': datetime.now(timezone.utc).isoformat(), 'contestants': contestants}
            (output / 'contestants.json').write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding='utf-8')
            with (output / 'contestants.csv').open('w', newline='', encoding='utf-8') as file:
                writer = csv.DictWriter(file, fieldnames=HEADERS)
                writer.writeheader()
                writer.writerows(contestants)
            (output / 'page.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
            (output / 'rendered.html').write_text(page.locator('body').inner_html(), encoding='utf-8')
            page.screenshot(path=str(output / 'page.png'), full_page=True)
            print(f'Extracted {len(contestants)} contestants.', flush=True)
        finally:
            browser.close()
    if args.update_sheet:
        update_sheet(contestants, output)
    return 0


def update_sheet(contestants, output):
    import gspread
    client = gspread.service_account(filename=str(ROOT / 'google_credentials.json'))
    workbook = client.open_by_key('1NYTUuNl-grPuXVoCUrYx70AvBYBV_l7Xm5dpRS9xI9M')
    workbook.fetch_sheet_metadata()
    try:
        sheet = workbook.worksheet('Contestants')
    except gspread.WorksheetNotFound:
        sheet = workbook.add_worksheet(title='Contestants', rows=100, cols=5)
    previous = sheet.get_all_values()
    backup = output / ('sheet-backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    backup.write_text(json.dumps(previous, indent=2, ensure_ascii=False), encoding='utf-8')
    values = [HEADERS] + [[person[key] for key in HEADERS] for person in contestants]
    if sheet.col_count < 5 or sheet.row_count < len(values):
        sheet.resize(rows=max(sheet.row_count, len(values)), cols=max(sheet.col_count, 5))
    rows = [{'values': [{'userEnteredValue': {'numberValue': value} if isinstance(value, int) else {'stringValue': value}} for value in row]} for row in values]
    workbook.batch_update({'requests': [{'updateCells': {'range': {'sheetId': sheet.id}, 'rows': rows, 'fields': 'userEnteredValue'}}]})
    if sheet.get(f'A1:E{len(values)}', value_render_option='UNFORMATTED_VALUE') != values or len(sheet.get_all_values()) != len(values):
        raise RuntimeError('Contestants sheet readback mismatch')
    print(f'Verified Contestants!A1:E{len(values)}: {len(contestants)} contestants.')


if __name__ == '__main__':
    raise SystemExit(main())
