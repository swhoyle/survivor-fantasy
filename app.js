function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field === '') quoted = !quoted;
      else field += ch;
    } else if (!quoted && ch === ',') { row.push(field); field = ''; }
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('The CSV contains an unfinished quoted value.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(row => row.some(cell => cell.trim() !== ''));
}

const status = document.querySelector('#status');
const table = document.querySelector('#data');
const button = document.querySelector('button');
const sheetURL = window.SHEET_CSV_URL || '';
let busy = false;

async function refresh() {
  if (busy) return;
  busy = true; button.disabled = true;
  try {
    const url = new URL(sheetURL);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/spreadsheets/')) {
      throw new Error('Use an HTTPS Google Sheets published CSV URL.');
    }
    status.textContent = 'Refreshing players…';
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000), credentials: 'omit' });
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status}.`);
    const text = await response.text();
    if (/^\s*(<!doctype|<html)/i.test(text)) throw new Error('This link returned a web page. Publish the tab as CSV and use that link.');
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('The published sheet is empty.');
    const head = document.createElement('thead');
    const body = document.createElement('tbody');
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      row.forEach(value => {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        cell.textContent = value;
        tr.append(cell);
      });
      (index === 0 ? head : body).append(tr);
    });
    table.replaceChildren(head, body);
    status.textContent = `${rows.length - 1} players · Updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    const message = error instanceof TypeError
      ? 'Could not reach the player list. Please try refreshing again.'
      : error.message;
    status.textContent = `Could not update: ${message} Previous results, if any, are still shown.`;
  } finally { busy = false; button.disabled = false; }
}

button.addEventListener('click', refresh);
setInterval(() => { if (!document.hidden) refresh(); }, 30000);
refresh();
