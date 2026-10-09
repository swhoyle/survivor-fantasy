"""Extract all published Advanced episode totals and scoring breakdowns."""
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
URL = 'https://fantasy.bracketology.tv/survivor/scoring-recaps'
TOTAL_HEADERS = ['Episode', 'Player', 'Total Score']
DETAIL_HEADERS = ['Episode', 'Player', 'Rule', 'Point']


def number(value):
    value = value.replace('−', '-').strip()
    match = re.fullmatch(r'([+-]?\d+)\s*(?:Pts)?', value)
    if not match:
        raise ValueError('Unexpected score format')
    return int(match[1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--headed', action='store_true')
    parser.add_argument('--update-sheet', action='store_true')
    args = parser.parse_args()
    load_dotenv(ROOT / '.env')
    output = ROOT / 'output/recaps'
    output.mkdir(parents=True, exist_ok=True)
    totals, details = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        try:
            page.goto(URL, wait_until='domcontentloaded')
            page.wait_for_function('document.body.innerText.length > 200')
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
            recap = page.locator('.scoring-recap')
            recap.locator('.contest-score').first.wait_for()
            page.locator('.center-content [role=progressbar]').wait_for(state='hidden')
            episodes = [text.strip() for text in recap.get_by_role('tab').all_text_contents()]
            if not episodes or len(episodes) != len(set(episodes)):
                raise RuntimeError('Missing or duplicate episode tabs')
            for episode in episodes:
                tab = recap.get_by_role('tab', name=episode, exact=True)
                tab.dispatch_event('click')
                page.wait_for_function("label => Array.from(document.querySelectorAll('.scoring-recap [role=tab]')).some(e => e.innerText.trim() === label && e.getAttribute('aria-selected') === 'true')", arg=episode)
                page.locator('.center-content [role=progressbar]').wait_for(state='hidden')
                recap.locator('.contest-score').first.wait_for()
                panels = recap.locator('.panel').filter(has=page.locator('.contest-score'))
                episode_totals, episode_details = [], []
                names = set()
                for index in range(panels.count()):
                    panel = panels.nth(index)
                    label = panel.locator('.contest-score > div').first.inner_text().strip()
                    player = re.sub(r'\s*\([^()]*\)$', '', label).strip()
                    total = number(panel.locator('.contest-score .para-3').inner_text())
                    if player in names:
                        raise RuntimeError('Duplicate contestant within episode')
                    names.add(player)
                    panel.locator(':scope > div').first.dispatch_event('click')
                    panel.locator('.justify-space-between > span').first.wait_for()
                    rows = panel.locator('.justify-space-between').evaluate_all("es => es.map(e => Array.from(e.querySelectorAll(':scope > span'), s => s.innerText.trim())).filter(row => row.length === 2)")
                    scored_rows = []
                    for rule, points in rows:
                        if rule == 'Actions' and points == 'Points':
                            continue
                        scored_rows.append([episode, player, rule, number(points)])
                    if sum(row[3] for row in scored_rows) != total:
                        raise RuntimeError(f'Breakdown does not match total for {episode}: {player}')
                    episode_totals.append([episode, player, total])
                    episode_details.extend(scored_rows)
                totals.extend(episode_totals)
                details.extend(episode_details)
                print(f'{episode}: {len(episode_totals)} contestants, {len(episode_details)} rule entries; all totals reconciled.', flush=True)
            if not totals or not details:
                raise RuntimeError('No complete recap data')
            snapshot = {'source_url': URL, 'extracted_at': datetime.now(timezone.utc).isoformat(), 'episodes': episodes, 'totals': [dict(zip(TOTAL_HEADERS, row)) for row in totals], 'details': [dict(zip(DETAIL_HEADERS, row)) for row in details]}
            (output / 'recaps.json').write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding='utf-8')
            for file_name, headers, rows in [('totals.csv', TOTAL_HEADERS, totals), ('details.csv', DETAIL_HEADERS, details)]:
                with (output / file_name).open('w', newline='', encoding='utf-8') as file:
                    writer = csv.writer(file)
                    writer.writerow(headers)
                    writer.writerows(rows)
        finally:
            browser.close()
    if args.update_sheet:
        update_sheets(totals, details, output)
    return 0


def update_sheets(totals, details, output):
    import gspread
    workbook = gspread.service_account(filename=str(ROOT / 'google_credentials.json')).open_by_key('1NYTUuNl-grPuXVoCUrYx70AvBYBV_l7Xm5dpRS9xI9M')
    workbook.fetch_sheet_metadata()
    targets, requests = [], []
    for title, headers, data in [('Episode Scores', TOTAL_HEADERS, totals), ('Episode Rules', DETAIL_HEADERS, details)]:
        values = [headers] + data
        try:
            sheet = workbook.worksheet(title)
        except gspread.WorksheetNotFound:
            sheet = workbook.add_worksheet(title=title, rows=max(100, len(values)), cols=len(headers))
        backup = output / (title.lower().replace(' ', '-') + '-backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
        backup.write_text(json.dumps(sheet.get_all_values(), indent=2), encoding='utf-8')
        if sheet.row_count < len(values) or sheet.col_count < len(headers):
            sheet.resize(rows=max(sheet.row_count, len(values)), cols=max(sheet.col_count, len(headers)))
        rows = [{'values': [{'userEnteredValue': {'numberValue': value} if isinstance(value, int) else {'stringValue': value}} for value in row]} for row in values]
        requests.append({'updateCells': {'range': {'sheetId': sheet.id}, 'rows': rows, 'fields': 'userEnteredValue'}})
        targets.append((sheet, values))
    workbook.batch_update({'requests': requests})
    for sheet, values in targets:
        last_col = chr(64 + len(values[0]))
        if sheet.get(f'A1:{last_col}{len(values)}', value_render_option='UNFORMATTED_VALUE') != values or len(sheet.get_all_values()) != len(values):
            raise RuntimeError('Sheet verification failed: ' + sheet.title)
        print(f'Verified {sheet.title}: {len(values)-1} rows.', flush=True)


if __name__ == '__main__':
    raise SystemExit(main())
