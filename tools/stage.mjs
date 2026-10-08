// 面の確かめ(描画なし・数秒)。node tools/stage.mjs [面の番号|all] [trace|demo|bot]
//   trace: 手本を流しながら 0.5 秒ごとに盤面を文字で出す(手本づくり用)
//   demo : 手本の結果(越えたか・最大連鎖・goal に届いたか)
//   bot  : bot で遊んだ結果
import { build } from 'vite';
import fs from 'node:fs';
const which = process.argv[2] ?? 'all';
const mode = process.argv[3] ?? 'demo';
const entry = 'tools/.stage-entry.ts';
fs.writeFileSync(entry, `
import { Game, cellX, cellY, cellOf, GRID } from '../src/game/logic';
import { STAGES, stageSeed } from '../src/game/stages';
import { Bot } from '../src/game/bot';
import { readParams } from '../src/game/params';
export const count = STAGES.length;
export function run(i: number, mode: string, log: (s: string) => void) {
  const st = STAGES[i];
  const g = new Game(stageSeed(i), readParams(), st);
  const bot = mode === 'bot' ? new Bot(0.9, 1) : null;
  const demo = [...((globalThis as any).DEMO ?? st.demo)].sort((a, b) => a[0] - b[0]);
  let di = 0;
  const chains: number[] = [];
  let lastPrint = -1;
  while (!g.over && g.t < 600) {
    let taps: Array<[number, number]> = [];
    if (bot) taps = bot.decide(g);
    else while (di < demo.length && demo[di][0] <= g.t + 1e-9) { const [, c, r] = demo[di++]; taps.push([cellX(r * GRID.cols + c), cellY(r * GRID.cols + c)]); if (mode === 'trace') log('  tap ' + c + ',' + r + ' @' + g.t.toFixed(2)); }
    g.step(taps);
    for (const e of g.drainEvents()) {
      if (e.type === 'chainEnd') { chains.push(e.n); if (mode === 'trace') log('  chain ' + e.n + ' @' + g.t.toFixed(2)); }
      if (mode === 'trace' && (e.type === 'houseOut' || e.type === 'purify' || e.type === 'wispPop' || e.type === 'break' || e.type === 'haunt' || e.type === 'saved' || e.type === 'light' || e.type === 'arm' || e.type === 'watch' || e.type === 'deny' || e.type === 'caught' || e.type === 'waveEnd')) log('  ' + e.type + ' @' + g.t.toFixed(2) + ('x' in e ? ' ' + Math.floor(((e as any).x - GRID.x0) / GRID.cell) + ',' + Math.floor(((e as any).y - GRID.y0) / GRID.cell) : ''));
    }
    if (mode === 'trace' && Math.floor(g.t * 2) !== lastPrint && g.ghosts.length) {
      lastPrint = Math.floor(g.t * 2);
      const rows: string[] = [];
      for (let r = 0; r < GRID.rows; r++) {
        let s = '';
        for (let c = 0; c < GRID.cols; c++) {
          const n = r * GRID.cols + c;
          const gh = g.ghosts.filter((q) => cellOf(q.x, q.y) === n);
          const l = g.lanterns.find((q) => q.cell === n);
          const h = g.houses.find((q) => q.cell === n);
          s += gh.length ? (gh.length > 9 ? '+' : String(gh.length)) : l ? (l.flying ? '^' : 'L') : h ? (h.lit ? 'H' : 'x') : g.blocks[n] ? '#' : '.';
        }
        rows.push(s);
      }
      log('t=' + g.t.toFixed(1) + '\\n' + rows.join('\\n'));
    }
  }
  const best = Math.max(0, ...chains);
  return { stage: i + 1, key: st.key, cleared: g.cleared, lit: g.litCount, best, goal: st.goal, star3: g.cleared && best >= st.goal, score: g.score, sec: Math.round(g.t), chains: chains.join(' ') };
}
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 's' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  if (process.env.DEMO) globalThis.DEMO = JSON.parse(process.env.DEMO);
  const mod = await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
  const list = which === 'all' ? [...Array(mod.count).keys()] : [Number(which) - 1];
  let ok = true;
  for (const i of list) {
    const r = mod.run(i, mode, (s) => console.log(s));
    console.log(JSON.stringify(r));
    if (mode === 'demo' && !r.star3) ok = false;
  }
  process.exitCode = ok ? 0 : 1;
} finally { fs.rmSync(entry, { force: true }); }
