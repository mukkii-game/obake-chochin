// 刻ごとの確かめ(描画なし・数秒)。最初の刻それぞれを、いろいろな腕前・やり方の bot に 1 刻だけ遊ばせて比べる。
// 使い方: node tools/waves.mjs [本数=6]
// 出力: 刻ごと・bot ごとに 消えた家 / 投げた数 / 成仏 / 1 投あたり成仏 / 最大連鎖
//   lead = 先読み / patient = 4 体まとめて取れるまで待つ / nolead = 今いる所へ / nohang = 下げない / lag1 = 指が 1 秒遅れる(KINDS= で選ぶ)
import { build } from 'vite';
import fs from 'node:fs';
const N = Number(process.argv[2] ?? 6);
const entry = 'tools/.waves-entry.ts';
fs.writeFileSync(entry, `
import { Game } from '../src/game/logic';
import { OPENING_WAVES } from '../src/game/waves';
import { Bot } from '../src/game/bot';
import { readParams } from '../src/game/params';
export const waves = OPENING_WAVES;
export function run(wave: number, seed: number, kind: string) {
  const g = new Game(seed, readParams(), wave);
  const bot = new Bot(0.9, seed, kind === 'lag1' ? 1 : 0);
  bot.noLead = kind === 'nolead'; bot.useHang = kind !== 'nohang'; if (kind === 'patient') bot.patience = 4;
  let thrown = 0, hangs = 0, kills = 0, best = 0, lost = 0;
  while (!g.over && g.t < 120) {
    g.step(bot.decide(g));
    let end = false;
    for (const e of g.drainEvents()) {
      if (e.type === 'launch') thrown++;
      if (e.type === 'hang') hangs++;
      if (e.type === 'purify') kills++;
      if (e.type === 'chainEnd') best = Math.max(best, e.n);
      if (e.type === 'houseOut') lost++;
      if (e.type === 'waveEnd') end = true;
    }
    if (end) break;
  }
  return { thrown, hangs, kills, best, lost };
}
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 'w' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  const mod = await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
  const kinds = (process.env.KINDS ?? 'lead,patient,nolead,nohang').split(',');
  for (let w = 0; w < mod.waves; w++) {
    const row = [];
    for (const k of kinds) {
      const s = { thrown: 0, hangs: 0, kills: 0, best: 0, lost: 0 };
      for (let i = 1; i <= N; i++) { const r = mod.run(w, i * 7919, k); for (const key in s) s[key] += r[key]; }
      row.push(`${k}: 消${(s.lost / N).toFixed(1)} 投${(s.thrown / N).toFixed(1)} 下${(s.hangs / N).toFixed(1)} 成${(s.kills / N).toFixed(1)} 率${(s.kills / Math.max(1, s.thrown)).toFixed(2)} 連${(s.best / N).toFixed(1)}`);
    }
    console.log(`刻${w + 1}  ` + row.join(' | '));
  }
} finally { fs.rmSync(entry, { force: true }); }
