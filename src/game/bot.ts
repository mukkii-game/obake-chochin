// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく、おばけの決まった動き(最短の道 / 一直線 / ジグザグ)から道筋を先読みし、
// 「提灯が着いて灯る頃に、多くのおばけが光の形の中を通る」マスへ、その形の家から投げる(家を選んでから投げる)。
// かかったら(見とれている間に)弾けさせる。影法師には着いたら弾ける提灯を投げる。
// lag: 決めてから指が動くまでの遅れ(秒)。noLead: 先読みせず、今いるマスへ投げる(比較用)。
import type { Game, Ghost } from './logic';
import { cellX, cellY, isPillar, CELLS, cellCol, cellRow } from './logic';
import { Rng } from '../core/rng';

interface Step { cell: number; t: number }

export class Bot {
  private cool = 0;
  private tapGap = 0;
  private frame = 0;
  private rng: Rng;
  private next: Array<[number, number]> = [];
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
    const r = this.next.length ? [this.next.shift()!] : this.think(g);
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
    const pending = (cell: number) => this.queue.some((q) => Math.hypot(q.x - cellX(cell), q.y - cellY(cell)) < 5);
    const paths = g.ghosts.filter((q) => !q.haunt).map((q) => ({ q, path: this.path(g, q, 12) }));

    // 1) 弾けさせる: 罠にかかったおばけが離れそう / 十分かかった / 光の形の中に他のおばけが来た / 騒いでいる家に光が届く
    for (const l of g.lanterns) {
      if (l.flying || pending(l.cell)) continue;
      const shape = g.shape(l.cell, l.piece);
      const inShape = (cell: number) => shape.some((s) => s.cell === cell);
      const caught = g.ghosts.filter((q) => q.lure === l.id && q.caught > 0);
      const coming = g.ghosts.filter((q) => q.lure === l.id && q.caught <= 0).length;
      const minLeft = caught.length ? Math.min(...caught.map((q) => q.caught)) : Infinity;
      // 光が広がる頃に形の中にいるおばけの数
      const hit = paths.filter(({ path }) => path.some((s) => s.t < 1.2 && inShape(s.cell))).length;
      const houseNear = g.houses.some((h) => h.haunt > 0 && inShape(h.cell));
      if (houseNear || (caught.length && (minLeft < 0.8 || hit >= 4 || coming === 0)) || hit >= 3) return [[l.x, l.y]];
      // 誰も寄らないまま枠を塞いでいる提灯は片付ける
      if (!caught.length && !coming && l.age > 10 && g.lanterns.length >= P.maxLanterns) return [[l.x, l.y]];
    }
    if (this.cool > 0 || g.lanterns.length >= P.maxLanterns || g.ammo <= 0) return [];
    const think = 1.0 - this.skill * 0.6;
    const used = (n: number) => isPillar(n) || g.lanterns.some((l) => l.cell === n) || pending(n) || g.houses.some((h) => h.cell === n);

    // 2) 騒いでいる家: 間に合うなら、着いたら弾ける提灯を、光が家に届くマスへ
    for (const h of g.houses) {
      if (h.haunt <= 0) continue;
      for (let i = 0; i < g.houses.length; i++) {
        if (!g.canThrow(i)) continue;
        for (let n = 0; n < CELLS; n++) {
          if (used(n) || Math.abs(cellCol(n) - cellCol(h.cell)) + Math.abs(cellRow(n) - cellRow(h.cell)) > 2) continue;
          const s = g.shape(n, g.houses[i].piece).find((q) => q.cell === h.cell);
          if (!s) continue;
          if (g.flightTime(n, i) + this.lag + 0.3 + s.d / P.lightSpeed < h.haunt) return this.fire(g, i, n, true, think);
        }
      }
    }

    // 3) 罠を仕掛ける: 家ごとの光の形で、灯る頃に多くのおばけが形の中を通るマス
    const free = paths.filter(({ q }) => !q.lure && q.caught <= 0);
    if (!free.length) return [];
    const cand = new Set<number>();
    for (const { path } of free) for (const s of path) {
      const c = cellCol(s.cell), r = cellRow(s.cell);
      for (let dr = -2; dr <= 2; dr++) for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc, rr = r + dr;
        if (cc >= 0 && rr >= 0 && cc < 13 && rr < 7) cand.add(rr * 13 + cc);
      }
    }
    let best: { house: number; cell: number; score: number; arm: boolean } | null = null;
    for (let i = 0; i < g.houses.length; i++) {
      if (!g.canThrow(i)) continue;
      const piece = g.houses[i].piece;
      for (const n of cand) {
        if (used(n) || n < 0) continue;
        const ft = g.flightTime(n, i) + this.lag;
        const shape = g.shape(n, piece);
        let score = 0, arm = false;
        // 着いたらすぐ弾けさせる場合: その頃に形の中にいるおばけ
        let armHit = 0, trapHit = 0, urgent = 0;
        for (const { q, path } of free) {
          const at = (t0: number, t1: number) => path.some((s) => s.t >= t0 && s.t <= t1 && shape.some((z) => z.cell === s.cell && t0 + z.d / P.lightSpeed <= s.t + 0.5));
          if (at(ft + 0.15, ft + 0.15 + 1.5)) armHit++;
          // 罠: 灯った後に、呼ぶ距離に入って来る(影法師は呼べない)
          if (q.kind !== 'kirai' && path.some((s) => s.t > ft + 0.2 && s.cell === n || (s.t > ft + 0.2 && g.pathDist(s.cell, n) <= Math.min(P.lureN, 2)))) trapHit++;
          urgent = Math.max(urgent, 1 / (1 + g.pathDist(path[0].cell, g.houses[q.target].cell)));
        }
        if (this.noLead) {
          // 先読みしない: 今おばけがいるマスにそのまま投げる
          if (!free.some(({ path }) => path[0].cell === n)) continue;
          score = 1 + armHit; arm = true;
        } else if (armHit >= 2 && armHit >= trapHit) { score = armHit * 1.3; arm = true; }
        else score = trapHit;
        score += urgent * 2 - this.rng.next() * (1 - this.skill) * 1.5;
        if (!best || score > best.score) best = { house: i, cell: n, score, arm };
      }
    }
    if (!best || best.score < 0.8) return [];
    if (best.score < 1.6 && g.ammo < 6) return []; // 弾は限られている。1 体だけ、急ぎでもないなら待つ
    return this.fire(g, best.house, best.cell, best.arm, think);
  }

  /** 家を選んで(遠い家なら)、マスへ投げる。arm なら飛んでいる間にもう一度押す */
  private fire(g: Game, house: number, cell: number, arm: boolean, think: number): Array<[number, number]> {
    this.cool = think + this.lag;
    const x = cellX(cell), y = cellY(cell);
    const h = g.houses[house];
    if (g.launchHouse(x, y) !== house && g.selected !== house) { this.next.push([x, y]); if (arm) this.next.push([x, y]); return [[h.x, h.y]]; }
    if (arm) this.next.push([x, y]);
    return [[x, y]];
  }

  /** おばけの道筋の先読み(マスとそこにいる時刻)。ゲームと同じ動き方の決まりで動かす */
  private path(g: Game, q: Ghost, horizon: number): Step[] {
    const p = g.predict(q, this.noLead ? 0 : horizon, 0.25);
    return p.filter((s) => s.cell >= 0).map((s) => ({ cell: s.cell, t: s.t }));
  }
}
