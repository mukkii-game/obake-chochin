// 盤面を文字で見る(描画なし・数秒)。決めたタップを流し、0.5 秒ごとのおばけと提灯の位置を出す。
// 使い方: TAPS='[[5,418,150],[5.2,418,150]]' node tools/trace.mjs [秒=30] [seed=1]   … [秒, x, y] を押す(1 文字 = 31px)
//   数字 = そのマスのおばけの数(止まっているものは s)/ L 下がった提灯 / ^ 飛んでいる提灯 / H 家
import { build } from 'vite';
import fs from 'node:fs';
const entry = 'tools/.trace-entry.ts';
fs.writeFileSync(entry, `
import { Game, PLAY } from '../src/game/logic';
import { readParams } from '../src/game/params';
export function run(taps: Array<[number, number, number]>, until: number, seed: number, log: (s: string) => void) {
  const g = new Game(seed, readParams());
  const list = [...taps].sort((a, b) => a[0] - b[0]);
  let i = 0, last = -1;
  while (!g.over && g.t < until) {
    const now: Array<[number, number]> = [];
    while (i < list.length && list[i][0] <= g.t + 1e-9) { const [, x, y] = list[i++]; now.push([x, y]); log('  tap ' + x + ',' + y + ' @' + g.t.toFixed(2)); }
    g.step(now);
    for (const e of g.drainEvents()) if (e.type !== 'spawn' && e.type !== 'purify' && e.type !== 'select') log('  ' + e.type + ' @' + g.t.toFixed(2) + ('n' in e ? ' n=' + (e as any).n : ''));
    if (Math.floor(g.t * 2) !== last && g.ghosts.length) {
      last = Math.floor(g.t * 2);
      const rows: string[] = [];
      const C = 31, cell = (x: number, y: number) => [Math.floor((x - PLAY.x0) / C), Math.floor((y - PLAY.y0) / C)].join(',');
      for (let r = 0; r < 14; r++) {
        let s = '';
        for (let c = 0; c < 26; c++) {
          const n = c + ',' + r;
          const gh = g.ghosts.filter((q) => cell(q.x, q.y) === n);
          const l = g.lanterns.find((q) => cell(q.x, q.y) === n);
          const h = g.houses.find((q) => cell(q.x, q.y) === n);
          s += gh.length ? (gh.some((q) => q.stopped) ? 's' : String(Math.min(9, gh.length))) : l ? (l.flying ? '^' : 'L') : h ? (h.lit ? 'H' : 'x') : '.';
        }
        rows.push(s);
      }
      log('t=' + g.t.toFixed(1) + ' ghosts=' + g.ghosts.length + '\\n' + rows.join('\\n'));
    }
  }
  return { t: Math.round(g.t), score: g.score, best: g.bestChain, lit: g.litCount, wave: g.wave };
}
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 't' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  const mod = await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
  console.log(JSON.stringify(mod.run(JSON.parse(process.env.TAPS ?? '[]'), Number(process.argv[2] ?? 30), Number(process.argv[3] ?? 1), (s) => console.log(s))));
} finally { fs.rmSync(entry, { force: true }); }
