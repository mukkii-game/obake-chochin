// ゲームの中身だけを bot で回す(描画なし・数秒)。バランス確認と決定性の確認。
// 使い方: node tools/sim.mjs [本数=20] [skill=0.8] [lag=0 秒] [all|break|launch]。NOLEAD=1 で先読みしない bot と比べる
// 出力: 生き残った秒数・スコア・最大連鎖の分布。同じ seed で 2 回回して結果が一致するかも見る。
import { build } from 'vite';
import fs from 'node:fs';

const N = Number(process.argv[2] ?? 20);
const SKILL = Number(process.argv[3] ?? 0.8);
const LAG = Number(process.argv[4] ?? 0);
const LAGON = process.argv[5] ?? 'all';
const entry = 'tools/.sim-entry.ts';
fs.writeFileSync(entry, `
import { Game, encodeTaps, decodeTaps } from '../src/game/logic';
import { Recorder, Player, decodeRecording } from '../src/core/replay';
import { Bot } from '../src/game/bot';
import { readParams } from '../src/game/params';
export function run(seed: number, skill: number, lag = 0, lagOn = 'all') {
  const g = new Game(seed, readParams());
  const bot = new Bot(skill, seed, lag, lagOn as any); bot.noLead = (globalThis as any).NOLEAD === 1;
  let breaks = 0, caught = 0, multi = 0, eaten = 0, saved = 0, lost = 0;
  while (!g.over && g.t < 900) {
    g.step(bot.decide(g));
    for (const e of g.drainEvents()) {
      if (e.type === 'break') breaks++;
      if (e.type === 'chainEnd') { caught += e.n; if (e.n >= 3) multi++; }
      if (e.type === 'saved') saved++;
      if (e.type === 'houseOut') lost++;
    }
  }
  return { seed, sec: Math.round(g.t), score: g.score, bestChain: g.bestChain, purified: g.purified, wave: g.wave,
    perBreak: breaks ? caught / breaks : 0, multiRate: breaks ? multi / breaks : 0, eaten: breaks, saved, lost };
}
/** bot の入力を記録 → 文字列 → 再生して、同じ結果になるか(?replay= の仕組みと同じ道) */
export function replayCheck(seed: number) {
  const g = new Game(seed, readParams()); const bot = new Bot(0.8, seed); const rec = new Recorder(seed);
  while (!g.over && g.t < 300) { const t = bot.decide(g); if (t.length) rec.push(g.frame + 1, encodeTaps(t)); g.step(t); g.drainEvents(); }
  const p = new Player(decodeRecording(rec.toString())!); const h = new Game(seed, readParams());
  while (!h.over && h.t < 300) { h.step(decodeTaps(p.input(h.frame + 1))); h.drainEvents(); }
  return g.score === h.score && g.frame === h.frame;
}
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 's' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  globalThis.NOLEAD = process.env.NOLEAD ? 1 : 0;
  const mod = await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
  const rows = [];
  if (process.env.DUMP) { for (let s = 1; s <= N; s++) { const r = mod.run(s * 7919, SKILL, LAG, LAGON); if (r.sec < 80) console.log(JSON.stringify(r)); } }
  for (let s = 1; s <= N; s++) rows.push(mod.run(s * 7919, SKILL, LAG, LAGON));
  const again = mod.run(7919, SKILL, LAG, LAGON);
  const deterministic = JSON.stringify(again) === JSON.stringify(rows[0]) && mod.replayCheck(4242);
  const med = (k) => rows.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  console.log(JSON.stringify({ ok: deterministic, deterministic, skill: SKILL, lag: LAG, runs: N,
    medianWave: med('wave'), perBreak: +(rows.reduce((s, r) => s + r.perBreak, 0) / rows.length).toFixed(2),
    multi3Rate: +(rows.reduce((s, r) => s + r.multiRate, 0) / rows.length).toFixed(2), medianBreaks: med('eaten'), medianSaved: med('saved'),
    medianSec: med('sec'), medianScore: med('score'), medianBestChain: med('bestChain'),
    minSec: Math.min(...rows.map((r) => r.sec)), maxSec: Math.max(...rows.map((r) => r.sec)) }, null, 1));
  process.exitCode = deterministic ? 0 : 1;
} finally { fs.rmSync(entry, { force: true }); }
