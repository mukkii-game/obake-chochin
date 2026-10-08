// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく、おばけの決まった動き(まっすぐ / ジグザグ / 曲線)から行き先を先読みし、
// 「提灯が着いて光が走る時に、光の形の中に一番多くいる」マスへ、その形の家から投げる(要れば家を選ぶ)。
// 長い列には、提灯を下げて先頭を止め(せき止め)、詰まったら弾けさせる。
// lag: 決めてから指が動くまでの遅れ(秒)。noLead: 先読みせず、今いる所へ投げる(比較用)。
import type { Game } from './logic';
import { cellX, cellY, CELLS, cellOf } from './logic';
import { Rng } from '../core/rng';

export class Bot {
  private cool = 0;
  private tapGap = 0;
  private frame = 0;
  private rng: Rng;
  private next: Array<[number, number]> = [];
  private queue: Array<{ due: number; x: number; y: number }> = [];
  noLead = false;
  /** 下げる手を使うか(比較用に切れる) */
  useHang = true;
  /** skill 0..1: 低いほど迷う時間が長く、読み違えが多い。乱数はゲームと別にする(記録の再生がずれないように) */
  constructor(private skill = 0.8, seed = 1, private lag = 0) { this.rng = new Rng(seed ^ 0x5bd1e995); }

  decide(g: Game): Array<[number, number]> {
    this.frame++;
    this.cool -= 1 / 60; this.tapGap -= 1 / 60;
    const out: Array<[number, number]> = [];
    while (this.queue.length && this.queue[0].due <= this.frame) { const q = this.queue.shift()!; out.push([q.x, q.y]); }
    if (g.over || this.tapGap > 0) return out;
    const r = this.next.length ? [this.next.shift()!] : this.frame % 6 === 0 ? this.think(g) : [];
    if (r.length) {
      this.tapGap = 0.12;
      for (const [x, y] of r) {
        if (this.lag > 0) this.queue.push({ due: this.frame + Math.round(this.lag * 60), x, y });
        else out.push([x, y]);
      }
    }
    return out;
  }

  private think(g: Game): Array<[number, number]> {
    const P = g.P;
    // 下げた提灯: 3 体以上詰まったら弾けさせる(待っても弾けるが、早い方が次が投げられる)
    for (const l of g.lanterns) {
      if (l.flying) continue;
      const stuck = g.ghosts.filter((q) => q.stopped).length;
      const near = g.ghosts.filter((q) => cellOf(q.x, q.y) === l.cell).length;
      if (near >= 2 && stuck >= 4) return [[l.x, l.y]];
    }
    if (this.cool > 0 || g.lanterns.length >= P.maxLanterns || g.ammo <= 0) return [];
    const free = g.ghosts.filter((q) => !q.haunt && !q.dead);
    if (!free.length) return [];
    const step = 0.25;
    const paths = free.map((q) => (this.noLead ? [{ cell: cellOf(q.x, q.y), t: 0 }] : g.predict(q, 14, step).map((s) => ({ cell: s.cell, t: s.t }))));
    const at = (p: Array<{ cell: number; t: number }>, t: number) => (this.noLead ? p[0].cell : p[Math.min(p.length - 1, Math.max(0, Math.round(t / step)))].cell);
    const think = 0.9 - this.skill * 0.6;
    let best: { house: number; cell: number; score: number; hang: boolean } | null = null;
    const busy = (n: number) => g.lanterns.some((l) => l.cell === n) || g.houses.some((h) => h.cell === n);
    // 候補のマス: おばけが通る所の周り
    const cand = new Set<number>();
    for (const p of paths) for (const s of p) if (s.cell >= 0) cand.add(s.cell);
    for (let i = 0; i < g.houses.length; i++) {
      if (!g.canThrow(i)) continue;
      const piece = g.houses[i].piece;
      for (const n of cand) {
        if (n < 0 || n >= CELLS || busy(n)) continue;
        const ft = g.flightTime(n, i) + this.lag;
        const shape = g.shape(n, piece);
        let hits = 0, urgent = 0;
        for (let k = 0; k < paths.length; k++) {
          const p = paths[k];
          // 光がそのマスに来た時に、そこにいるか
          if (shape.some((z) => { const t = ft + z.d / P.lightSpeed + 0.2; return at(p, t) === z.cell; })) {
            hits++;
            urgent = Math.max(urgent, 1 / (1 + (p.length - 1) * step / 4));
          }
        }
        // 長い列(後ろが続いて来る)なら、下げて先頭を止める手も考える
        let hangScore = 0;
        if (this.useHang && !this.noLead) {
          const passers = paths.filter((p) => p.some((s) => s.cell === n && s.t > ft + 0.3 && s.t < ft + P.hangTime - 0.5)).length;
          if (passers >= 3) hangScore = passers * 0.9;
        }
        const hang = hangScore > hits;
        let score = Math.max(hits, hangScore) + urgent * 2 - this.rng.next() * (1 - this.skill) * 1.5;
        if (!hits && !hang) score = -1;
        if (!best || score > best.score) best = { house: i, cell: n, score, hang };
      }
    }
    if (!best || best.score < 0.5) return [];
    // 1 体しか取れない時は、家に近づくまで待つ(弾を惜しむ)
    if (best.score < 1.4 && g.ammo > 6 && !this.noLead) return [];
    this.cool = think + this.lag;
    const x = cellX(best.cell), y = cellY(best.cell);
    const h = g.houses[best.house];
    const taps: Array<[number, number]> = [];
    if (g.launchHouse(x, y) !== best.house) taps.push([h.x, h.y]);
    taps.push([x, y]);
    if (best.hang) taps.push([x, y]);
    this.next.push(...taps.slice(1));
    return [taps[0]];
  }
}
