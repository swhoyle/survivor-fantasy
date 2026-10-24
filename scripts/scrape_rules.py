"""Extract Bracketology's rendered Survivor rules using an automatic login."""
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
URL = 'https://fantasy.bracketology.tv/survivor/game-rules'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--headed', action='store_true')
    parser.add_argument('--update-sheet', action='store_true', help='Replace the Scoring tab after successful extraction')
    args = parser.parse_args()
    load_dotenv(ROOT / '.env')
    output = ROOT / 'output' / 'rules'
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headed)
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
                    f'URL: {page.url}\\nTitle: {title}\\nHTTP status: {response.status if response else "unknown"}\\n\\n{body}',
                    encoding='utf-8',
                )
                page.screenshot(path=str(output / 'failure.png'), full_page=True)
                print(f'Page did not render expected content. URL={page.url}; title={title}; diagnostics saved under {output.relative_to(ROOT)}.', flush=True)
                raise
            if page.locator('input[type=password]').is_visible():
                username = os.getenv('BRACKETOLOGY_USERNAME')
                password = os.getenv('BRACKETOLOGY_PASSWORD')
                if not username or not password:
                    raise RuntimeError('Missing login variables in .env')
                page.locator('input[type=email]').fill(username)
                page.locator('input[type=password]').fill(password)
                page.get_by_role('button', name='Confirm', exact=True).click()
                page.get_by_text('Welcome back!', exact=True).wait_for(timeout=30000)
                print('Login succeeded. Selecting Survivor.', flush=True)
                survivor = page.get_by_text('Survivor', exact=True)
                survivor.locator('xpath=ancestor::*[.//*[normalize-space(text())="Play"]][1]').get_by_text('Play', exact=True).click()
                page.wait_for_url(re.compile('/survivor'), timeout=30000)
                print('Survivor selected. Opening rules.', flush=True)
                page.goto(URL, wait_until='domcontentloaded')
            page.wait_for_function("/points/i.test(document.body.innerText) && /scoring|game rules/i.test(document.body.innerText)", timeout=20000)
            page.wait_for_function("document.querySelectorAll('.v-expansion-panel-text .para-2').length > 0", timeout=20000)
            modes = []
            for mode in ['Advanced', 'First Impression', 'Confidence Pool', 'Week to Week']:
                page.locator('.tab').filter(has_text=re.compile('^\\s*' + re.escape(mode) + '\\s*$')).dispatch_event('click')
                page.locator('.game-rules-page .heading-2').filter(has_text=re.compile('^\\s*' + re.escape(mode) + '\\s*$')).wait_for()
                if mode == 'Advanced':
                    page.wait_for_function("document.querySelectorAll('.v-expansion-panel-text .para-2').length > 0", timeout=20000)
                content = page.locator('.game-rules-page')
                rows = content.locator('.v-expansion-panel-text .para-2').evaluate_all("es => es.map(e => Array.from(e.children, c => c.innerText.trim())).filter(r => r.length === 2)")
                rules = []
                section = ''
                category = ''
                for label, value in rows:
                    if not re.fullmatch(r'[+-]?\d+', value):
                        raise RuntimeError('Unexpected scoring value')
                    heading = value == '0' and (label.isupper() or label.startswith('--'))
                    if heading:
                        if label.startswith('--'):
                            category = label.strip('- ').strip()
                        else:
                            section, category = label, ''
                    rules.append({'description': label, 'points': int(value), 'section': section, 'category': category, 'is_heading': heading})
                modes.append({'mode': mode, 'text': content.inner_text(), 'rules': rules})
                page.screenshot(path=str(output / f"{mode.lower().replace(' ', '-')}.png"), full_page=True)
                print(f'{mode}: {len(rules)} scoring rows.', flush=True)
            text = '\n\n'.join(mode['text'] for mode in modes)
            snapshot = {'source_url': URL, 'final_url': page.url, 'extracted_at': datetime.now(timezone.utc).isoformat(), 'modes': modes}
            (output / 'rules.json').write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding='utf-8')
            (output / 'page.txt').write_text(text, encoding='utf-8')
            with (output / 'rules.csv').open('w', newline='', encoding='utf-8') as file:
                writer = csv.DictWriter(file, fieldnames=['mode', 'section', 'category', 'description', 'points', 'is_heading'])
                writer.writeheader()
                for mode in modes:
                    writer.writerows({'mode': mode['mode'], **rule} for rule in mode['rules'])
            print(f'Saved {len(modes)} game modes to rules.json and rules.csv.', flush=True)
        except Exception as error:
            message = str(error)
            text = page.locator('body').inner_text()
            for secret in (os.getenv('BRACKETOLOGY_USERNAME'), os.getenv('BRACKETOLOGY_PASSWORD')):
                if secret:
                    text = text.replace(secret, '[redacted]')
                    message = message.replace(secret, '[redacted]')
            links = page.locator('a').evaluate_all("es => es.map(e => ({text: e.innerText, path: new URL(e.href).pathname}))")
            cards = page.get_by_text('Survivor', exact=True).evaluate_all("es => es.map(e => e.parentElement.outerHTML.slice(0,5000))")
            (output / 'diagnostic.json').write_text(json.dumps({'error': message, 'text': text, 'links': links, 'cards': cards}, indent=2), encoding='utf-8')
            print('Extraction failed; sanitized diagnostics saved to output/rules/diagnostic.json.', flush=True)
            return 1
        finally:
            browser.close()
    if args.update_sheet:
        from update_scoring import update_scoring
        update_scoring()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
