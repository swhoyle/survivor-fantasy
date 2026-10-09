const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const files = new Set(['index.html', 'app.js', 'config.js']);
const types = { '.html': 'text/html', '.js': 'text/javascript' };
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!files.has(file)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const content = await fs.readFile(path.join(__dirname, file));
    res.writeHead(200, { 'Content-Type': `${types[path.extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(content);
  } catch { res.writeHead(500); res.end('Could not load file'); }
}).listen(5173, '127.0.0.1', () => console.log('Survivor test app: http://127.0.0.1:5173'));
