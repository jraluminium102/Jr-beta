// review-server.mjs — static server เสิร์ฟ public/ ที่ :5599 (กดลิงก์ตรวจงาน /review/*.html)
// รัน: node scripts/review-server.mjs   (background)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.woff2':'font/woff2' };
const PORT = process.env.JR_PREVIEW_PORT || 5599;
http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/' || p === '') p = '/review/';
    if (p.endsWith('/')) p += 'index.html';
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<meta charset="utf-8"><h1>404</h1><p>ไม่พบ: ' + (req.url||'') + '</p>');
  }
}).listen(PORT, () => console.log('review server → http://localhost:' + PORT + '/review/'));
