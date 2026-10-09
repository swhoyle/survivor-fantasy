"""Extract completed episode scores and picks for all league members."""
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://fantasy.bracketology.tv/survivor/league/scoreboard?id=105275'
SCORE_HEADERS = ['Episode', 'User', 'Points']
PICK_HEADERS = ['Episode', 'User', 'Contestant']


def collect_history(page, users):
    output = ROOT / 'output/user-picks'
    output.mkdir(parents=True, exist_ok=True)
    scores, picks = [], []
    for username, rank, total in users:
        page.goto(URL, wait_until='domcontentloaded')
        page.locator('.gametype-table .table-row:visible').first.wait_for()
        page.locator('.center-content [role=progressbar]').wait_for(state='hidden')
        page.locator('.gametype-table:visible .table-row').filter(has_text=username).last.dispatch_event('click')
        page.get_by_text('Previous Picks', exact=True).wait_for()
        buttons = page.locator('.v-expansion-panel-title:visible').filter(has_text=re.compile(r'Episode.*[+-]?\d+\s*Pts'))
        buttons.first.wait_for()
        episode_count = buttons.count()
        user_total = 0
        for index in range(episode_count):
            button = buttons.nth(index)
            title = button.inner_text().strip()
            match = re.fullmatch(r'(Episode\s+\d+\s*-\s*\d+/\d+)\s*([+-]?\d+)\s*Pts', title)
            if not match:
                raise RuntimeError('Unexpected episode score format')
            episode, points = match[1], int(match[2])
            panel = button.locator('xpath=..')
            if button.get_attribute('aria-expanded') != 'true':
                button.dispatch_event('click')
            panel.locator('.lineup-contestants').first.wait_for()
            lineups = panel.locator('.lineup-contestants')
            # Multiple lineups need an explicit lineup column rather than silent merging.
            if lineups.count() != 1:
                raise RuntimeError('Multiple lineups found; sheet was not changed')
            cards = lineups.locator(':scope > div').evaluate_all("es => es.map(e => Array.from(e.querySelectorAll(':scope > div'), d => d.innerText.trim()))")
            selected = []
            lineup_total = 0
            for label, value in cards:
                contestant = re.sub(r'\s*\([^()]*\)$', '', label).strip()
                lineup_total += int(value.replace('−', '-'))
                selected.append(contestant)
            if not selected or len(selected) != len(set(selected)) or lineup_total != points:
                raise RuntimeError(f'Incomplete or inconsistent lineup: {username}, {episode}')
            scores.append([episode, username, points])
            picks.extend([episode, username, contestant] for contestant in selected)
            user_total += points
        if user_total != total:
            raise RuntimeError(f'Episode scores do not match leaderboard total: {username}')
        print(f'{username}: {episode_count} episodes, total {user_total}; picks and leaderboard reconciled.', flush=True)
    scores.sort(key=lambda row: (int(re.search(r'\d+', row[0])[0]), row[1]))
    picks.sort(key=lambda row: (int(re.search(r'\d+', row[0])[0]), row[1], row[2]))
    snapshot = {'source_url': URL, 'extracted_at': datetime.now(timezone.utc).isoformat(), 'scores': [dict(zip(SCORE_HEADERS, row)) for row in scores], 'picks': [dict(zip(PICK_HEADERS, row)) for row in picks]}
    (output / 'user-picks.json').write_text(json.dumps(snapshot, indent=2), encoding='utf-8')
    for filename, headers, rows in [('user-scores.csv', SCORE_HEADERS, scores), ('user-picks.csv', PICK_HEADERS, picks)]:
        with (output / filename).open('w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            writer.writerow(headers)
            writer.writerows(rows)
    return scores, picks


def update_history(scores, picks):
    import gspread
    workbook = gspread.service_account(filename=str(ROOT / 'google_credentials.json')).open_by_key('1NYTUuNl-grPuXVoCUrYx70AvBYBV_l7Xm5dpRS9xI9M')
    workbook.fetch_sheet_metadata()
    requests, targets = [], []
    for title, headers, data in [('User Scores', SCORE_HEADERS, scores), ('User Picks', PICK_HEADERS, picks)]:
        values = [headers] + data
        try:
            sheet = workbook.worksheet(title)
        except gspread.WorksheetNotFound:
            sheet = workbook.add_worksheet(title=title, rows=max(100, len(values)), cols=3)
        backup = ROOT / 'output/user-picks' / (title.replace(' ', '-') + '-backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
        backup.write_text(json.dumps(sheet.get_all_values(), indent=2), encoding='utf-8')
        if sheet.row_count < len(values) or sheet.col_count < 3:
            sheet.resize(rows=max(sheet.row_count, len(values)), cols=max(sheet.col_count, 3))
        rows = [{'values': [{'userEnteredValue': {'numberValue': value} if isinstance(value, int) else {'stringValue': value}} for value in row]} for row in values]
        requests.append({'updateCells': {'range': {'sheetId': sheet.id}, 'rows': rows, 'fields': 'userEnteredValue'}})
        targets.append((sheet, values))
    workbook.batch_update({'requests': requests})
    for sheet, values in targets:
        if sheet.get(f'A1:C{len(values)}', value_render_option='UNFORMATTED_VALUE') != values or len(sheet.get_all_values()) != len(values):
            raise RuntimeError('Sheet readback mismatch: ' + sheet.title)
        print(f'Verified {sheet.title}: {len(values)-1} rows.', flush=True)


if __name__ == '__main__':
    from scrape_scoreboard import main
    sys.argv = [sys.argv[0]] + ['--update-history' if arg == '--update-sheet' else arg for arg in sys.argv[1:]] + ['--member-history']
    raise SystemExit(main())
