// バランスと攻略性の確認: 腕前の違う bot を並べて回す(描画なし)。
// 使い方: node tools/eval.mjs [本数=10]。OVR='{"catchR":60}' で数値を上書きして比べられる。
// 出力: bot ごとのクリア率・日ごとに失った家・得点・最大連鎖・1 発あたりの成仏数、刻ごとの家の損失。
// 攻略性の目安: 上手い bot と先読みしない bot の差(得点・クリア率)が大きいほど、工夫が効いている。
import { build } from 'vite';
import fs from 'node:fs';

const N = Number(process.argv[2] ?? 10);
const entry = 'tools/.eval-entry.ts';
fs.writeFileSync(entry, `
import { Game } from '../src/game/logic';
import { Bot } from '../src/game/bot';
import { readParams } from '../src/game/params';
export function run(seed: number, skill: number, lag: number, noLead: boolean, ovr: Record<string, number>, patience = 2, link = 0, blind = false) {
  const g = new Game(seed, { ...readParams(), ...ovr });
  const bot = new Bot(skill, seed, lag); bot.noLead = noLead; bot.patience = patience; bot.linkBias = link; bot.shapeBlind = blind;
  let breaks = 0, caught = 0, multi = 0; const src = { kill: 0, combo: 0, form: 0, wave: 0 };
  const lostWave = new Array(9).fill(0);
  while (!g.over && g.t < 900) {
    g.step(bot.decide(g));
    for (const e of g.drainEvents()) {
      if (e.type === 'break') breaks++;
      if (e.type === 'purify') src.kill += e.pts;
      if (e.type === 'chainEnd') src.combo += e.bonus;
      if (e.type === 'formation') src.form += e.bonus;
      if (e.type === 'waveEnd') src.wave += e.bonus;
      if (e.type === 'chainEnd') { caught += e.n; if (e.n >= 3) multi++; }
      if (e.type === 'houseOut') lostWave[Math.min(8, g.wave)]++;
    }
  }
  return { cleared: g.cleared ? 1 : 0, wave: g.wave, score: g.score, best: g.bestChain, perBreak: breaks ? caught / breaks : 0, multi: breaks ? multi / breaks : 0, lostWave, src };
}
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 'e' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  const mod = await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
  const ovr = process.env.OVR ? JSON.parse(process.env.OVR) : {};
  const profiles = [['上手い', 0.9, 0, false, 2], ['ためる(4体まとめ狙い)', 0.9, 0, false, 4], ['網を作る(つなげて置く)', 0.9, 0, false, 2, 1.2], ['形を考えない(近い家から)', 0.9, 0, false, 2, 0, true], ['形を考えない・0.6秒遅れ', 0.8, 0.6, false, 2, 0, true], ['ふつう(0.6秒遅れ)', 0.8, 0.6, false, 2], ['初心者(1秒遅れ・雑)', 0.55, 1.0, false, 2], ['先読みしない', 0.8, 0, true, 2]];
  if (process.env.ONLY) profiles.splice(0, profiles.length, ...profiles.filter((p) => process.env.ONLY.split(',').includes(String(profiles.indexOf(p)))));
  const res = {};
  for (const [name, skill, lag, nl, pat, link, blind] of profiles) {
    const rows = []; for (let s = 1; s <= N; s++) rows.push(mod.run(s * 7919, skill, lag, nl, ovr, pat, link ?? 0, blind ?? false));
    const avg = (f) => +(rows.reduce((a, r) => a + f(r), 0) / rows.length).toFixed(2);
    const lw = new Array(9).fill(0).map((_, i) => avg((r) => r.lostWave[i]));
    res[name] = { clear: avg((r) => r.cleared), reachWave: avg((r) => r.wave + 1), score: Math.round(avg((r) => r.score)), best: avg((r) => r.best), perBreak: avg((r) => r.perBreak), multi3: avg((r) => r.multi), lostByWave: lw.join(' '), src: ['kill', 'combo', 'form', 'wave'].map((k) => k + ':' + Math.round(avg((r) => r.src[k]))).join(' ') };
  }
  console.log(JSON.stringify({ ovr, runs: N, res }, null, 1));
} finally { fs.rmSync(entry, { force: true }); }
