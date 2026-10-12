// 刻ごとのクリア率(描画なし・数十秒)。最初から通しで遊ばせ、その刻を越えられた割合(通しなので後の刻ほど下がる)。
// 使い方: node tools/clear.mjs [本数=30]。BOTS='0.8:0,0.8:0.6' で skill:遅れ秒 の bot を選ぶ。OVR='{"ghostSpeed":30}' で params を上書き
// 出力: 刻ごと・bot ごとに 越えた割合 / その刻で消えた家 / 出た敵 / 1 発で 2 体以上まとめて倒した回数 / 大連鎖で戻った家(その刻に着いた回の平均)
import { build } from 'vite';
import fs from 'node:fs';
const N = Number(process.argv[2] ?? 30);
const entry = 'tools/.clear-entry.ts';
fs.writeFileSync(entry, `
import { Game } from '../src/game/logic';
import { OPENING_WAVES } from '../src/game/waves';
import { Bot } from '../src/game/bot';
import { readParams } from '../src/game/params';
export const waves = OPENING_WAVES;
export function run(seed: number, skill: number, lag: number, ovr: Record<string, number>) {
  const g = new Game(seed, { ...readParams(), ...ovr });
  const bot = new Bot(skill, seed, lag);
  const per = Array.from({ length: OPENING_WAVES }, () => ({ clear: 0, reached: 0, kills: 0, lost: 0, multi: 0, spawned: 0, relit: 0 }));
  while (!g.over && g.t < 900) {
    g.step(bot.decide(g));
    const w = per[Math.min(g.wave, OPENING_WAVES - 1)]; w.reached = 1;
    for (const e of g.drainEvents() as any[]) {
      if (e.type === 'purify') w.kills++;
      if (e.type === 'spawn') w.spawned++;
      if (e.type === 'multi' && e.n === 2) w.multi++;
      if (e.type === 'houseOut') w.lost++;
      if (e.type === 'relight') w.relit++;
      if (e.type === 'waveEnd') per[e.n].clear = 1;
    }
  }
  return per;
}
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 'c' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  const mod = await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
  const bots = (process.env.BOTS ?? '0.8:0,0.8:0.6,0.6:0.8').split(',').map((s) => s.split(':').map(Number));
  const ovr = JSON.parse(process.env.OVR ?? '{}');
  const res = bots.map(([sk, lag]) => Array.from({ length: N }, (_, i) => mod.run((i + 1) * 7919, sk, lag, ovr)));
  for (let w = 0; w < mod.waves; w++) {
    const row = bots.map(([sk, lag], bi) => {
      const s = { clear: 0, reached: 0, kills: 0, lost: 0, multi: 0, spawned: 0, relit: 0 };
      for (const r of res[bi]) for (const k in s) s[k] += r[w][k];
      const a = Math.max(1, s.reached);
      return `${sk}/${lag}s: ${String(Math.round((s.clear / N) * 100)).padStart(3)}% 消${(s.lost / a).toFixed(1)} 敵${(s.spawned / a).toFixed(0)} まとめ${(s.multi / a).toFixed(1)} 戻${(s.relit / a).toFixed(1)}`;
    });
    console.log(`刻${w + 1}  ` + row.join(' | '));
  }
} finally { fs.rmSync(entry, { force: true }); }
