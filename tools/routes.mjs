// おばけの移動ルート図: 前の動き(1 日目 / 2・3 日目の集まる筋あり)と、いまの動き(ghost.moves = 1)を並べる。
// ゲームの道筋の計算(logic.ts)をそのまま使う。点は 1 秒ごとの位置(間が広いほど速い)。
// 使い方: node tools/routes.mjs → tools/out/routes.html と routes.png
import { build } from 'vite';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const entry = 'tools/.routes-entry.ts';
fs.writeFileSync(entry, `
import { Game, colX } from '../src/game/logic';
import { readParams } from '../src/game/params';
export function routes(groups: any[], moveSet: number, startWave: number, via?: number) {
  const g = new Game(1, { ...readParams(), moveSet }, startWave);
  return {
    houses: g.houses.map((h) => [h.x, h.y]),
    lines: groups.map((gr) => gr.cols.map((c: number) => {
      const o = g.addGhost({ ...gr, via }, colX(c), 0);
      const dots = g.predict(o, 90, 1).map((p) => [p.x, p.y]);
      g.ghosts.length = 0;
      return { path: o.path, dots };
    })),
  };
}
`);
const out = await build({ logLevel: 'silent', configFile: false,
  define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
  build: { write: false, lib: { entry, formats: ['es'], fileName: 'r' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
fs.unlinkSync(entry);
globalThis.location = { search: '' };
const mod = await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));

// 見本(waves.ts の型から代表を 1 つずつ)
const S = [
  ['幽霊の行列', 'fuwa', [{ t: 0, kind: 'fuwa', cols: [5], n: 1, gap: 0, to: 2 }]],
  ['幽霊の横並び', 'fuwa', [{ t: 0, kind: 'fuwa', cols: [4, 5, 6], n: 1, gap: 0, to: 2, turn: 0.6 }]],
  ['唐傘', 'kasa', [{ t: 0, kind: 'kasa', cols: [0], n: 1, gap: 0, to: 4, turn: 0.3 }]],
  ['横から来る組', 'fuwa', [{ t: 0, kind: 'fuwa', cols: [0], n: 1, gap: 0, to: 3, edge: -1, turn: 0.45 }]],
  ['行進(インベーダー)', 'fuwa', [{ t: 0, kind: 'fuwa', cols: [0], n: 1, gap: 0, to: 2, edge: -1, turn: 0.1, march: true }]],
  ['鬼火', 'oni', [{ t: 0, kind: 'oni', cols: [2], n: 1, gap: 0, to: 3, side: 1 }]],
  ['大入道', 'big', [{ t: 0, kind: 'big', cols: [6], n: 1, gap: 0, to: 2, turn: 0.5 }]],
  ['はやて', 'kaze', [{ t: 0, kind: 'kaze', cols: [3], n: 1, gap: 0, to: 1, turn: 0.5 }]],
  ['いなずま', 'inazuma', [{ t: 0, kind: 'inazuma', cols: [2], n: 1, gap: 0, to: 3, side: 1 }]],
];
const COLS = [
  ['前の動き・1 日目', 0, 0, undefined],
  ['前の動き・2〜3 日目(筋に集まる)', 0, 3, 480],
  ['いまの動き', 1, 3, undefined],
];
const COLOR = { fuwa: '#9ff0ff', kasa: '#ffb0e0', oni: '#b8ffb0', big: '#ffd27a', kaze: '#c8a0ff', inazuma: '#ff8a6a' };
const SC = 0.36, PW = 960 * SC, PH = 540 * SC;

const panel = (r, color) => {
  const pt = ([x, y]) => `${(x * SC).toFixed(1)},${(y * SC).toFixed(1)}`;
  let s = `<svg viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}"><rect width="100%" height="100%" rx="6" fill="#141225"/>`;
  s += `<rect x="${77 * SC}" y="${53 * SC}" width="${806 * SC}" height="${434 * SC}" fill="none" stroke="#2c2950" stroke-dasharray="3 3"/>`;
  for (const [x, y] of r.houses) s += `<rect x="${x * SC - 7}" y="${y * SC - 7}" width="14" height="12" rx="2" fill="#ffb347" opacity="0.85"/>`;
  for (const ls of r.lines) for (const l of ls) {
    s += `<polyline points="${l.path.map(pt).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" opacity="0.9"/>`;
    l.dots.forEach((d, i) => { s += `<circle cx="${(d[0] * SC).toFixed(1)}" cy="${(d[1] * SC).toFixed(1)}" r="${i === 0 ? 4 : 2.2}" fill="${i === 0 ? '#fff' : color}"/>`; });
  }
  return s + '</svg>';
};

let rows = '';
for (const [name, kind, groups] of S) {
  rows += `<tr><th>${name}</th>`;
  for (const [, ms, sw, via] of COLS) rows += `<td>${panel(mod.routes(groups, ms, sw, via), COLOR[kind])}</td>`;
  rows += '</tr>';
}
const html = `<!doctype html><meta charset="utf-8"><title>おばけの移動ルート</title>
<style>body{background:#0b0a16;color:#eee;font-family:"WenQuanYi Zen Hei","Hiragino Sans",sans-serif;margin:16px}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:#bbb;font-size:13px}table{border-collapse:separate;border-spacing:8px 6px}
th{font-size:14px;text-align:right;white-space:nowrap;padding-right:6px}thead th{text-align:center;font-size:14px;color:#ffe27a}</style>
<h1>おばけの移動ルート(前 / いま)</h1>
<p>白い点 = 出てくる所。小さな点 = 1 秒ごとの位置(間が広いほど速い)。橙の四角 = 家。点線の枠 = 遊ぶ範囲。速さは張り切りタイム・最後の一匹・家の直前の加速を除く。</p>
<table><thead><tr><th></th>${COLS.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/routes.html', html);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 1.5 });
await page.setContent(html);
await page.screenshot({ path: 'tools/out/routes.png', fullPage: true });
await browser.close();
console.log('tools/out/routes.html, tools/out/routes.png');
