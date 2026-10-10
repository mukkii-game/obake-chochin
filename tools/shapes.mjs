// 光の形ごとの「1 発で何体まで取れるか」を、隊列ごとに調べる(描画なし・bot なし)。
// おばけの通り道を記録して、置く所(20px ごと)と弾ける時(0.2 秒ごと)をぜんぶ試し、
//   最大 = 1 発で取れる最多、3体+ = 3 体以上取れる置き所の数(多いほど狙いやすい)
// を形ごとに並べる。提灯に触れて止まる(せき止め)は入れない(素の通り道だけ)。
// 使い方: node tools/shapes.mjs。OVR='{"diagAngle":26.6}' で数値を上書き。GAPS='1,1.5,2' で隊列の間の倍率。
import { build } from 'vite';
import fs from 'node:fs';

const entry = 'tools/.shapes-entry.ts';
fs.writeFileSync(entry, `
import { Game, colX, ghostR, PLAY, GROUND_Y, DT } from '../src/game/logic';
import { readParams } from '../src/game/params';
const PIECES = ['vline', 'hline', 'area', 'dr', 'dl'] as const;
export function measure(groups: any[], ovr: Record<string, number>, wave: number) {
  const g = new Game(1, { ...readParams(), feverMult: 1, lastRush: 1, ...ovr }, wave);
  (g as any).groups = [];
  while (!g.begun) g.step();
  // 隊列を出して、通り道を記録(1/20 秒ごと)
  const spawns: Array<{ at: number; gr: any; c: number }> = [];
  for (const gr of groups) for (let i = 0; i < gr.n; i++) for (const c of gr.cols) spawns.push({ at: gr.t + i * gr.gap, gr, c });
  const tracks = new Map<number, { r: number; pts: Array<[number, number, number]> }>();
  const t0 = g.t;
  for (let f = 0; f < 60 * 45; f++) {
    const t = g.t - t0;
    for (const s of spawns.filter((s) => s.at <= t)) { spawns.splice(spawns.indexOf(s), 1); g.addGhost(s.gr, colX(s.c), 7); }
    g.step();
    if (f % 3 === 0) for (const o of g.ghosts) if (!o.dead && o.y >= PLAY.y0) {
      if (!tracks.has(o.id)) tracks.set(o.id, { r: ghostR(o), pts: [] });
      tracks.get(o.id)!.pts.push([g.t - t0, o.x, o.y]);
    }
    if (!spawns.length && !g.ghosts.length) break;
  }
  const T = [...tracks.values()];
  const tEnd = Math.max(...T.flatMap((k) => k.pts.map((p) => p[0])));
  const out: Record<string, { max: number; good: number }> = {};
  for (const piece of PIECES) {
    const life = (g.reach(piece) + 13 + g.band) / g.P.lightSpeed;
    let max = 0, good = 0;
    for (let cx = PLAY.x0 + 10; cx < PLAY.x1; cx += 20) for (let cy = PLAY.y0 + 10; cy <= GROUND_Y; cy += 20) {
      for (let tb = 0; tb < tEnd; tb += 0.2) {
        let hits = 0;
        for (const k of T) {
          const hit = k.pts.some(([t, x, y]) => {
            if (t < tb || t > tb + life) return false;
            const a = g.along(piece, cx, cy, x, y, k.r), ext = (t - tb) * g.P.lightSpeed;
            return a >= 0 && a <= ext && a >= ext - g.band;
          });
          if (hit) hits++;
        }
        if (hits > max) max = hits;
        if (hits >= 3) good++;
      }
    }
    out[piece] = { max, good };
  }
  return { n: T.length, out };
}
`);
const out = await build({ logLevel: 'silent', configFile: false,
  define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
  build: { write: false, lib: { entry, formats: ['es'], fileName: 's' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
fs.unlinkSync(entry);
globalThis.location = { search: '' };
const mod = await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));

const ovr = process.env.OVR ? JSON.parse(process.env.OVR) : {};
const gaps = (process.env.GAPS ?? '1').split(',').map(Number);
const wave = Number(process.env.WAVE ?? 3);
// 見本の隊列(waves.ts の型)。gap は倍率で広げる
const S = [
  ['幽霊の行列(縦一列 5)', [{ t: 0, kind: 'fuwa', cols: [5], n: 5, gap: 0.9, to: 2 }]],
  ['幽霊の横並び(3 列ならび)', [{ t: 0, kind: 'fuwa', cols: [4, 5, 6], n: 1, gap: 0, to: 2, turn: 0.6 }]],
  ['唐傘の横渡り(4)', [{ t: 0, kind: 'kasa', cols: [0], n: 4, gap: 0.8, to: 4, turn: 0.3 }]],
  ['横から(3)', [{ t: 0, kind: 'fuwa', cols: [0], n: 3, gap: 0.6, to: 3, edge: -1, turn: 0.45 }]],
  ['行進(6)', [{ t: 0, kind: 'fuwa', cols: [0], n: 6, gap: 0.8, to: 2, edge: -1, turn: 0.1, march: true }]],
  ['鬼火の斜め(5)', [{ t: 0, kind: 'oni', cols: [2], n: 5, gap: 0.6, to: 3, side: 1 }]],
  ['いなずま(3)', [{ t: 0, kind: 'inazuma', cols: [2], n: 3, gap: 0.45, to: 3, side: 1 }]],
];
const NAME = { vline: '縦', hline: '横', area: '丸', dr: '右上がり', dl: '左上がり' };
console.log(`設定 ${JSON.stringify(ovr)}  ${wave + 1} 刻目(${Math.floor(wave / 3) + 1} 日目の光の長さ)`);
for (const k of gaps) {
  console.log(`\n== 隊列の間 ×${k}  (各形: 最大 / 3体以上取れる置き所の数)`);
  for (const [name, gs] of S.filter((_, i) => !process.env.PAT || process.env.PAT.split(',').includes(String(i)))) {
    const r = mod.measure(gs.map((g) => ({ ...g, gap: g.gap * k })), ovr, wave);
    console.log(name.padEnd(16, ' '), Object.entries(r.out).map(([p, v]) => `${NAME[p]} ${v.max}/${v.good}`).join('  '));
  }
}
