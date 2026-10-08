// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく、おばけの決まった動き(まっすぐ / ジグザグ / 曲線)から行き先を先読みし、
// 「提灯が着いて光る時に、光の形の中に一番多くいる」所へ、その形の家から投げる(要れば家を選ぶ)。
// 長い列が来る所には、提灯を下げて先頭を止め(せき止め)、詰まらせる。
// lag: 決めてから指が動くまでの遅れ(秒)。noLead: 先読みせず、今いる所へ投げる(比較用)。
import type { Game } from './logic';
import { HOUSE_R, PLAY } from './logic';
import { Rng } from '../core/rng';

type Pt = { x: number; y: number; t: number };

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
    // 下げた提灯: まわりに 3 体以上つかえたら弾けさせる
    for (const l of g.lanterns) {
      if (l.flying) continue;
      const near = g.ghosts.filter((q) => q.stopped && Math.hypot(q.x - l.tx, q.y - l.ty) < P.lineReach).length;
      if (near >= 3) return [[l.tx, l.ty]];
    }
    if (this.cool > 0 || g.lanterns.length >= P.maxLanterns || g.ammo <= 0) return [];
    const free = g.ghosts.filter((q) => !q.haunt && !q.dead && !q.stopped);
    if (!free.length) return [];
    const step = 0.25;
    const paths: Pt[][] = free.map((q) => (this.noLead ? [{ x: q.x, y: q.y, t: 0 }] : g.predict(q, 12, step)));
    const at = (p: Pt[], t: number) => (this.noLead ? p[0] : p[Math.min(p.length - 1, Math.max(0, Math.round(t / step)))]);
    const ok = (x: number, y: number) => x > PLAY.x0 + 4 && x < PLAY.x1 - 4 && y > PLAY.y0 + 4 && y < PLAY.y1 - 4
      && !g.houses.some((h) => Math.hypot(h.x - x, h.y - y) < HOUSE_R + 2) && !g.lanterns.some((l) => Math.hypot(l.tx - x, l.ty - y) < P.grabR + 2);
    let best: { house: number; x: number; y: number; score: number; hang: boolean } | null = null;
    for (let i = 0; i < g.houses.length; i++) {
      if (!g.canThrow(i)) continue;
      const piece = g.houses[i].piece;
      for (const p of paths) {
        for (const s of p) {
          if (!ok(s.x, s.y)) continue;
          const ft = g.flightTime(s.x, s.y, i) + this.lag;
          // 着いた時にそのおばけがそこにいる所(先読みしないなら今いる所)
          if (!this.noLead && Math.abs(ft - s.t) > step * 0.6) continue;
          let hits = 0, urgent = 0;
          for (const q of paths) {
            const e = at(q, ft + 0.2);
            if (g.along(piece, s.x, s.y, e.x, e.y, 10) >= 0) { hits++; urgent = Math.max(urgent, 1 / (1 + (q.length - 1) * step / 3)); }
          }
          // 列が続いて来る所なら、下げて先頭を止める手も考える
          let hangScore = 0;
          if (this.useHang && !this.noLead) {
            const pass = paths.filter((q) => q.some((u) => u.t > ft && u.t < ft + P.hangTime - 1 && Math.hypot(u.x - s.x, u.y - s.y) < P.catchR)).length;
            if (pass >= 3) hangScore = pass * 0.8;
          }
          const hang = hangScore > hits;
          const score = Math.max(hits, hangScore) + urgent * 2 - this.rng.next() * (1 - this.skill) * 1.5;
          if (!best || score > best.score) best = { house: i, x: Math.round(s.x), y: Math.round(s.y), score, hang };
        }
      }
    }
    if (!best || best.score < 0.5) return [];
    // 1 体しか取れない時は、家に近づくまで待つ(弾を惜しむ)
    if (best.score < 1.4 && g.ammo > 6 && !this.noLead) return [];
    this.cool = 0.9 - this.skill * 0.6 + this.lag;
    const h = g.houses[best.house];
    const taps: Array<[number, number]> = [];
    if (g.launchHouse(best.x, best.y) !== best.house) taps.push([h.x, h.y]);
    taps.push([best.x, best.y]);
    if (best.hang) taps.push([best.x, best.y]);
    this.next.push(...taps.slice(1));
    return [taps[0]];
  }
}
