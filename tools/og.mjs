// public/og.png(SNS のリンク画像 1200x630)を自動プレイの画面から撮る。
// 使い方: npm run build && node tools/og.mjs [秒数=40]
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const SEC = Number(process.argv[2] ?? 40);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let p = new URL(req.url, 'http://x').pathname; if (p.endsWith('/')) p += 'index.html';
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(join('dist', p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`http://127.0.0.1:${server.address().port}/?auto=1&lang=ja&seed=3`);
await page.waitForTimeout(SEC * 1000);
await page.screenshot({ path: 'public/og.png' });
await browser.close(); server.close();
console.log('saved public/og.png');
