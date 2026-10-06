// 部品の自己確認(描画なし・数秒)。同じ seed と入力なら同じ結果になるか。
// npm run test:replay
import { build } from 'vite';
import fs from 'node:fs';
const entry = 'tools/.replay-entry.ts';
fs.writeFileSync(entry, `
import { Rng } from '../src/core/rng';
import { Recorder, Player, decodeRecording } from '../src/core/replay';
const a = new Rng(42), b = new Rng(42);
const sa = Array.from({ length: 5 }, () => a.int(1, 100));
const sb = Array.from({ length: 5 }, () => b.int(1, 100));
const rec = new Recorder(42); rec.push(3, 'L'); rec.push(10, 'A'); rec.push(10, 'R');
const back = decodeRecording(rec.toString())!; const p = new Player(back);
const replayed = [3, 10].map((f) => p.input(f));
const ok = JSON.stringify(sa) === JSON.stringify(sb) && back.seed === 42 && replayed.join('|') === 'L|AR';
console.log(JSON.stringify({ ok, sameSequence: sa, replayed }));
(globalThis as any).__ok = ok;
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""', __BUILD_ID__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 't' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
} finally { fs.rmSync(entry, { force: true }); }
process.exit(globalThis.__ok ? 0 : 1);
