"""Replace only the Scoring tab using the latest extracted scoring rules."""
import json
from datetime import datetime, timezone
from pathlib import Path

import gspread

ROOT = Path(__file__).resolve().parents[1]
SPREADSHEET_ID = '1NYTUuNl-grPuXVoCUrYx70AvBYBV_l7Xm5dpRS9xI9M'


def update_scoring():
    snapshot = json.loads((ROOT / 'output/rules/rules.json').read_text(encoding='utf-8'))
    advanced = next(mode for mode in snapshot['modes'] if mode['mode'] == 'Advanced')
    values = [['Category', 'Subcategory', 'Rule', 'Point']]
    for rule in advanced['rules']:
        if rule['is_heading']:
            continue
        if not rule['description'] or not isinstance(rule['points'], int):
            raise ValueError('Invalid rule; Scoring was not changed')
        values.append([rule['section'], rule['category'], rule['description'], rule['points']])
    if len(values) < 2:
        raise ValueError('No scoring rules; Scoring was not changed')
    client = gspread.service_account(filename=str(ROOT / 'google_credentials.json'))
    workbook = client.open_by_key(SPREADSHEET_ID)
    metadata = workbook.fetch_sheet_metadata()
    print('Spreadsheet tabs: ' + ', '.join(sheet['properties']['title'] for sheet in metadata['sheets']))
    try:
        worksheet = workbook.worksheet('Scoring')
    except gspread.WorksheetNotFound:
        worksheet = workbook.add_worksheet(title='Scoring', rows=max(100, len(values)), cols=4)
    previous = worksheet.get_all_values()
    backup = ROOT / 'output/rules' / ('scoring-backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    backup.write_text(json.dumps(previous, ensure_ascii=False, indent=2), encoding='utf-8')
    if worksheet.row_count < len(values) or worksheet.col_count < 4:
        worksheet.resize(rows=max(worksheet.row_count, len(values)), cols=max(worksheet.col_count, 4))
    # One atomic update clears all old cell values and writes the new rows.
    # Formatting remains intact. A failed API request leaves the prior values intact.
    rows = [{'values': [{'userEnteredValue': {'numberValue': cell} if isinstance(cell, int) else {'stringValue': cell}} for cell in row]} for row in values]
    workbook.batch_update({'requests': [{'updateCells': {
        'range': {'sheetId': worksheet.id}, 'rows': rows, 'fields': 'userEnteredValue'
    }}]})
    actual = worksheet.get(f'A1:D{len(values)}', value_render_option='UNFORMATTED_VALUE')
    if actual != values or len(worksheet.get_all_values()) != len(values):
        raise RuntimeError('Scoring readback did not match expected values')
    print(f'Verified Scoring!A1:D{len(values)}: {len(values) - 1} rules.')
    return worksheet.url


if __name__ == '__main__':
    update_scoring()
