// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく、おばけが辻でどう曲がるかを読んで道筋を先読みし、提灯が着く頃に多くの道筋が通る辻へ罠を仕掛ける。
// かかったら(見とれている間に)弾けさせる。影法師には着いたら弾ける提灯を投げる。騒いでいる家は間に合えば助ける。
// lag: 決めてから指が動くまでの遅れ(秒)。noLead: 先読みせず、今いる辻へ投げる(比較用)。
import type { Game, Ghost } from './logic';
import { gridDist, nodeX, nodeY, GRID } from './logic';
import { Rng } from '../core/rng';

interface Step { n: number; t: number }

export class Bot {
  private cool = 0;
  private tapGap = 0;
  private frame = 0;
  private rng: Rng;
  private arms: Array<[number, number]> = [];
  private queue: Array<{ due: number; x: number; y: number }> = [];
  noLead = false;
  /** skill 0..1: 低いほど迷う時間が長く、読み違えが多い。乱数はゲームと別にする(記録の再生がずれないように) */
  constructor(private skill = 0.8, seed = 1, private lag = 0, private lagOn: 'all' | 'break' | 'launch' = 'all') { this.rng = new Rng(seed ^ 0x5bd1e995); }

  decide(g: Game): Array<[number, number]> {
    this.frame++;
    this.cool -= 1 / 60; this.tapGap -= 1 / 60;
    const out: Array<[number, number]> = [];
    while (this.queue.length && this.queue[0].due <= this.frame) { const q = this.queue.shift()!; out.push([q.x, q.y]); }
    if (g.over || this.tapGap > 0) return out;
    const r = this.think(g);
    if (r.length) {
      this.tapGap = 0.15;
      for (const [x, y] of r) {
        if (this.lag > 0 && this.lagOn !== 'break') this.queue.push({ due: this.frame + Math.round(this.lag * 60), x, y });
        else out.push([x, y]);
      }
    }
    return out;
  }

  private think(g: Game): Array<[number, number]> {
    const P = g.P;
    if (this.arms.length) return [this.arms.shift()!];
    const pending = (n: number) => this.queue.some((q) => Math.hypot(q.x - nodeX(n), q.y - nodeY(n)) < 5);

    // 1) 弾けさせる: 罠にかかったおばけが離れそう / 十分かかった / もう誰も来ない
    for (const l of g.lanterns) {
      if (l.flying || pending(l.node)) continue;
      const caught = g.ghosts.filter((q) => q.lure === l.id && q.caught > 0);
      const coming = g.ghosts.filter((q) => q.lure === l.id && q.caught <= 0).length;
      const minLeft = caught.length ? Math.min(...caught.map((q) => q.caught)) : Infinity;
      const houseNear = g.houses.some((h) => h.haunt > 0 && gridDist(h.node, l.node) <= P.range && (nodeX(h.node) === l.x || nodeY(h.node) === l.y));
      if (houseNear || (caught.length && (minLeft < 0.7 || caught.length >= 4 || coming === 0))) return [[l.x, l.y]];
      // 誰も寄らないまま枠を塞いでいる提灯は片付ける
      if (!caught.length && !coming && l.age > 8 && g.lanterns.length >= P.maxLanterns) return [[l.x, l.y]];
    }
    if (this.cool > 0 || g.lanterns.length >= P.maxLanterns || g.ammo <= 0) return [];
    const think = 0.9 - this.skill * 0.6;
    const used = (n: number) => g.lanterns.some((l) => gridDist(l.node, n) <= 1) || pending(n) || g.houses.some((h) => h.node === n);

    // 2) 騒いでいる家: 間に合うなら、着いたら弾ける提灯をその家の辻へ
    for (const h of g.houses) {
      if (h.haunt <= 0) continue;
      // 家の辻には下げられないので、隣の辻から光を通す
      for (const m of [1, -1, GRID.cols, -GRID.cols].map((d) => h.node + d)) {
        if (m < 0 || m >= GRID.cols * GRID.rows || gridDist(m, h.node) !== 1 || used(m)) continue;
        if (g.flightTime(m) + this.lag + 0.2 + 1 / P.lightSpeed < h.haunt) return this.fire(g, m, true, think);
      }
    }

    // 3) 罠を仕掛ける: 提灯が灯った後に、多くの道筋が近くを通る辻
    const free = g.ghosts.filter((q) => !q.lure && !q.haunt && q.caught <= 0);
    const paths = free.map((q) => ({ q, path: this.path(g, q, 14) }));
    let best: { n: number; score: number; arm: boolean } | null = null;
    for (const { q, path } of paths) {
      const sniper = q.kind === 'kirai';
      for (const s of path) {
        if (used(s.n)) continue;
        const ft = g.flightTime(s.n) + this.lag;
        let score = 0;
        if (sniper) {
          // 影法師: 着いた瞬間に弾けて、光が広がる頃にそこを通る辻
          if (Math.abs(s.t - (ft + 0.3)) > 0.5) continue;
          score = 2.5;
        } else {
          if (!this.noLead && s.t < ft + 0.3) continue; // 先に灯っていないと呼べない
          for (const o of paths) {
            if (o.q.kind === 'kirai') continue;
            if (o.path.some((m) => m.t > ft && gridDist(m.n, s.n) <= Math.min(P.lureN, 2))) score++;
          }
        }
        const urgency = 1 / (1 + this.toHouse(g, q));
        score += urgency * 3 - (this.rng.next() * (1 - this.skill));
        if (!best || score > best.score) best = { n: s.n, score, arm: sniper };
      }
    }
    if (!best) return [];
    if (best.score < 1.6 && g.ammo < 6) return []; // 弾は限られている。1 体だけ、急ぎでもないなら待つ
    return this.fire(g, best.n, best.arm, think);
  }

  private fire(g: Game, n: number, arm: boolean, think: number): Array<[number, number]> {
    this.cool = think + this.lag;
    const x = nodeX(n), y = nodeY(n);
    if (arm) this.arms.push([x, y]);
    void g;
    return [[x, y]];
  }

  /** おばけの道筋の先読み(辻とそこに着く時刻)。ゲームと同じ曲がり方の決まりで歩かせる */
  private path(g: Game, q: Ghost, horizon: number): Step[] {
    const P = g.P;
    const c: Ghost = { ...q, passed: [...q.passed], lure: 0 };
    const sp = q.speed * (1 + P.speedRamp * g.wave) * (q.kind === 'hop' ? 2 : 1);
    const len = (a: number, b: number) => Math.hypot(nodeX(b) - nodeX(a), nodeY(b) - nodeY(a));
    let n = q.to, t = q.pause + (q.from === q.to ? 0 : (len(q.from, q.to) - q.prog) / sp);
    const out: Step[] = [{ n, t }];
    if (this.noLead) return [{ n: q.from === q.to ? q.from : (q.prog > len(q.from, q.to) / 2 ? q.to : q.from), t: 0 }];
    const houseNode = () => g.houses[c.target].node;
    while (t < horizon && out.length < 24 && n !== houseNode()) {
      const nx = g.chooseNext(c, n);
      if (!nx) break;
      c.dir = nx.dir;
      t += len(n, nx.next) / sp + (q.kind === 'hop' ? P.hopPause : 0);
      n = nx.next;
      out.push({ n, t });
    }
    return out;
  }

  private toHouse(g: Game, q: Ghost) {
    return gridDist(q.to, g.houses[q.target].node);
  }
}
