"""Refresh the current scoreboard for Survivor league 105275."""
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
URL = 'https://fantasy.bracketology.tv/survivor/league/scoreboard?id=105275'
HEADERS = ['Username', 'Rank', 'Points']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--headed', action='store_true')
    parser.add_argument('--update-sheet', action='store_true')
    parser.add_argument('--inspect-member', help='Save a member detail page for scraper development')
    parser.add_argument('--member-history', action='store_true')
    parser.add_argument('--update-history', action='store_true')
    args = parser.parse_args()
    load_dotenv(ROOT / '.env')
    output = ROOT / 'output/scoreboard'
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
                    raise RuntimeError('Missing .env login credentials')
                page.locator('input[type=email]').fill(username)
                page.locator('input[type=password]').fill(password)
                page.get_by_role('button', name='Confirm', exact=True).click()
                page.get_by_text('Welcome back!', exact=True).wait_for()
                page.get_by_text('Survivor', exact=True).locator('xpath=ancestor::*[.//*[normalize-space(text())="Play"]][1]').get_by_text('Play', exact=True).click()
                page.wait_for_url(re.compile('/survivor'))
                page.goto(URL, wait_until='domcontentloaded')
            page.locator('.gametype-table .table-row:visible').first.wait_for()
            page.locator('.center-content [role=progressbar]').wait_for(state='hidden')
            (output / 'page.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
            (output / 'rendered.html').write_text(page.locator('body').inner_html(), encoding='utf-8')
            tables = page.locator('.gametype-table:visible')
            if tables.count() != 1:
                raise RuntimeError('Expected one scoreboard table; no sheet values changed')
            raw = tables.locator('.table-row').evaluate_all("rows => rows.map(row => Array.from(row.querySelectorAll(':scope > .tr-item'), (cell,index) => {const copy=cell.cloneNode(true);if(index===1)copy.querySelectorAll('.first-letter-username,img').forEach(e=>e.remove());return copy.textContent.trim();}))")
            users = {}
            for rank, username, points in raw:
                entry = [username, int(rank), int(points)]
                if username in users and users[username] != entry:
                    raise RuntimeError('Conflicting duplicate username; no sheet values changed')
                users[username] = entry
            values = sorted(users.values(), key=lambda row: (row[1], row[0]))
            if not values or any(not row[0] or row[1] < 1 for row in values):
                raise RuntimeError('Invalid or empty scoreboard')
            snapshot = {'source_url': URL, 'league_id': 105275, 'extracted_at': datetime.now(timezone.utc).isoformat(), 'users': [dict(zip(HEADERS, row)) for row in values]}
            (output / 'scoreboard.json').write_text(json.dumps(snapshot, indent=2), encoding='utf-8')
            with (output / 'scoreboard.csv').open('w', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                writer.writerow(HEADERS)
                writer.writerows(values)
            print(f'Extracted {len(values)} unique league members.', flush=True)
            if args.member_history:
                from scrape_user_picks import collect_history
                scores, picks = collect_history(page, values)
            if args.inspect_member:
                tables.locator('.table-row').filter(has_text=args.inspect_member).last.dispatch_event('click')
                page.locator('.v-expansion-panel-title:visible').filter(has_text='Episode 1').first.wait_for()
                (output / 'member.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                (output / 'member.html').write_text(page.locator('body').inner_html(), encoding='utf-8')
                print('Saved member view.', flush=True)
        finally:
            (output / 'diagnostic.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
            (output / 'diagnostic.html').write_text(page.locator('body').inner_html(), encoding='utf-8')
            browser.close()
    if args.update_history:
        from scrape_user_picks import update_history
        update_history(scores, picks)
    if args.update_sheet:
        import gspread
        workbook = gspread.service_account(filename=str(ROOT / 'google_credentials.json')).open_by_key('1NYTUuNl-grPuXVoCUrYx70AvBYBV_l7Xm5dpRS9xI9M')
        workbook.fetch_sheet_metadata()
        try:
            sheet = workbook.worksheet('Scoreboard')
        except gspread.WorksheetNotFound:
            sheet = workbook.add_worksheet(title='Scoreboard', rows=100, cols=3)
        backup = output / ('sheet-backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
        backup.write_text(json.dumps(sheet.get_all_values(), indent=2), encoding='utf-8')
        values = [HEADERS] + values
        if sheet.row_count < len(values) or sheet.col_count < 3:
            sheet.resize(rows=max(sheet.row_count, len(values)), cols=max(sheet.col_count, 3))
        rows = [{'values': [{'userEnteredValue': {'numberValue': value} if isinstance(value, int) else {'stringValue': value}} for value in row]} for row in values]
        workbook.batch_update({'requests': [{'updateCells': {'range': {'sheetId': sheet.id}, 'rows': rows, 'fields': 'userEnteredValue'}}]})
        if sheet.get(f'A1:C{len(values)}', value_render_option='UNFORMATTED_VALUE') != values or len(sheet.get_all_values()) != len(values):
            raise RuntimeError('Scoreboard sheet readback mismatch')
        print(f'Verified Scoreboard!A1:C{len(values)}: {len(values)-1} members.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
