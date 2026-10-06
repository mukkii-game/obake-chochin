// 起動確認: dist をローカル配信 → ?auto=1 で開く → 60 秒(CI は 20 秒)コンソールエラーなし
// → スコアが増える → スクショ 3 枚を tools/out/ に保存。AI は結果だけ読む(トークン節約)。
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = 'dist';
const OUT = 'tools/out';
const SECONDS = Number(process.env.CHECK_SECONDS ?? (process.env.CI ? 20 : 60));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/index.html がありません。先に npm run build'); process.exit(2); }
await mkdir(OUT, { recursive: true });

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(DIST, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const url = `http://127.0.0.1:${port}/?auto=1`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 540, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(url.replace('?auto=1', '?lang=en'), { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-title.png` });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/02-play.png` });
const s1 = await page.evaluate(() => window.__game?.score ?? 0);
await page.waitForTimeout(Math.max(0, SECONDS * 1000 - 4500));
const s2 = await page.evaluate(() => window.__game?.score ?? 0);
const scene = await page.evaluate(() => window.__game?.scene);
await page.screenshot({ path: `${OUT}/03-late.png` });
await browser.close(); server.close();

const ok = errors.length === 0 && s2 > s1;
console.log(JSON.stringify({ ok, seconds: SECONDS, scoreStart: s1, scoreEnd: s2, scene, errors: errors.slice(0, 5) }, null, 2));
process.exit(ok ? 0 : 1);
