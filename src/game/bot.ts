// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく、おばけの決まった動き(まっすぐ / ジグザグ / 曲線)から行き先を先読みし、
// 「提灯が着いて光る時に、光の形の中に一番多くいる」所へ、その形の家から投げる(要れば家を選ぶ)。
// 「着いて fuse 秒後に弾ける」ので、その時におばけがいる所を狙う(提灯に着いたおばけは止まって待つのも勘定する)。
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
  /** 何体まとめて取れるまで待つか(家に迫るおばけがいれば待たない) */
  patience = 2;
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
    if (this.cool > 0 || g.lanterns.length >= P.maxLanterns || g.ammo <= 0) return [];
    const free = g.ghosts.filter((q) => !q.haunt && !q.dead && !q.caught);
    if (!free.length) return [];
    const step = 0.25;
    const paths: Pt[][] = free.map((q) => (this.noLead ? [{ x: q.x, y: q.y, t: 0 }] : g.predict(q, 14, step)));
    const at = (p: Pt[], t: number) => (this.noLead ? p[0] : p[Math.min(p.length - 1, Math.max(0, Math.round(t / step)))]);
    const ok = (x: number, y: number) => x > PLAY.x0 + 4 && x < PLAY.x1 - 4 && y > PLAY.y0 + 4 && y < PLAY.y1 - 4
      && !g.houses.some((h) => Math.hypot(h.x - x, h.y - y) < HOUSE_R + 2) && !g.lanterns.some((l) => Math.hypot(l.tx - x, l.ty - y) < P.grabR + 2);
    let best: { house: number; x: number; y: number; score: number; hits: number } | null = null;
    const span = (Math.max(g.reach('vline'), g.reach('area')) + g.band) / P.lightSpeed;
    for (let i = 0; i < g.houses.length; i++) {
      if (!g.canThrow(i)) continue;
      const piece = g.houses[i].piece;
      for (const p of paths) {
        for (const s of p) {
          // 狙う所: おばけが「着いて fuse 秒後」にいる所(先読みしないなら今いる所)
          const ft = g.flightTime(s.x, s.y, i) + this.lag;
          const T = ft + P.fuse;
          if (!this.noLead && Math.abs(T - s.t) > step * 0.6) continue;
          if (!ok(s.x, s.y)) continue;
          let hits = 0, urgent = 0;
          for (const q of paths) {
            // 着いてから弾けるまでの間に提灯まで来るおばけは、見とれて止まる → 弾けた時にそこにいる
            let hit = q.some((u) => u.t >= ft && u.t <= T && Math.hypot(u.x - s.x, u.y - s.y) < P.catchR);
            for (let dt = 0; dt <= span && !hit; dt += 0.1) {
              const e = at(q, T + dt), a = g.along(piece, s.x, s.y, e.x, e.y, 11), ext = dt * P.lightSpeed;
              hit = a >= 0 && a <= ext && a >= ext - g.band;
            }
            // 大入道は残りの力の分だけ当てる値打ちがある(早めに何度も当てる)
            if (hit) { hits += free[paths.indexOf(q)].hp; urgent = Math.max(urgent, 1 / (1 + (q.length - 1) * step / 3)); }
          }
          const score = hits + urgent * 2 - this.rng.next() * (1 - this.skill) * 1.5;
          if (!best || score > best.score) best = { house: i, x: Math.round(s.x), y: Math.round(s.y), score, hits };
        }
      }
    }
    if (!best || best.hits < 1) return [];
    // まとめて取れる時を待つ(patience 体に届かず、家に迫るおばけもいなければ待つ)
    const danger = free.some((q) => Math.hypot(g.houses[q.target].x - q.x, g.houses[q.target].y - q.y) < 170);
    if (!this.noLead && !danger && best.hits < this.patience) return [];
    this.cool = 0.9 - this.skill * 0.6 + this.lag;
    const h = g.houses[best.house];
    // 選んだ家は続くので、投げたい家が「いま投げる家」でなければ、その家を押して選ぶ
    const willThrow = g.selected >= 0 && g.canThrow(g.selected) ? g.selected : g.launchHouse(best.x, best.y);
    if (willThrow !== best.house) { this.next.push([best.x, best.y]); return [[h.x, h.y]]; }
    return [[best.x, best.y]];
  }
}
