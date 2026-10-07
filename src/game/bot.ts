// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の起動確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく「提灯が着いて弾ける頃に、群れがどこにいるか」を先読みして投げる。
// 光嫌いは飛んでいる提灯を押して「着いたら弾ける」で落とし、騒いでいる家は間に合えば助けに行く。
// lag: 決めてから指が動くまでの遅れ(秒)。成績が lag で大きく落ちない = 反射神経のゲームではない、の確認用。
import type { Game, Ghost } from './logic';
import { clamp, FIELD } from './logic';
import { Rng } from '../core/rng';

export class Bot {
  private cool = 0;
  private tapGap = 0;
  private frame = 0;
  private rng: Rng;
  /** 投げた直後に押して「着いたら弾ける」にする行き先 */
  private arms: Array<[number, number]> = [];
  private queue: Array<{ due: number; x: number; y: number }> = [];
  /** 比較用: 先読みせず、今いる所へ投げる */
  noLead = false;
  /** skill 0..1: 低いほど狙いが雑で、迷う時間が長い。乱数はゲームと別にする(記録の再生がずれないように) */
  constructor(private skill = 0.8, seed = 1, private lag = 0, private lagOn: 'all' | 'break' | 'launch' = 'all') { this.rng = new Rng(seed ^ 0x5bd1e995); }

  decide(g: Game): Array<[number, number]> {
    this.frame++;
    this.cool -= 1 / 60; this.tapGap -= 1 / 60;
    const out: Array<[number, number]> = [];
    while (this.queue.length && this.queue[0].due <= this.frame) { const q = this.queue.shift()!; out.push([q.x, q.y]); }
    if (g.over || this.tapGap > 0) return out;
    const r = this.think(g);
    if (r.length) {
      this.tapGap = 0.12;
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
    if (this.cool > 0 || g.lanterns.length >= P.maxLanterns || g.ammo <= 0) return [];
    const think = 0.9 - this.skill * 0.6;
    const miss = (1 - this.skill) * 50;
    const busy = (x: number, y: number) => g.lanterns.some((l) => Math.hypot(l.tx - x, l.ty - y) < P.lureR * 0.8);

    // 1) 騒いでいる家: 間に合うなら、その家へ「着いたら弾ける」提灯
    for (const h of g.houses) {
      if (h.haunt <= 0 || busy(h.x, h.y)) continue;
      if (g.flightTime(h.x, h.y) + this.lag + 0.15 < h.haunt) return this.fire(h.x, h.y, true, think, 0);
    }

    // 2) 群れ: 弾ける頃の位置を先読みし、一番多く巻き込める所へ
    const free = g.ghosts.filter((q) => !q.lure && !q.haunt);
    let best: { x: number; y: number; n: number; urgent: boolean; snipe: boolean } | null = null;
    for (const q of free) {
      const snipe = q.kind === 'kirai';
      let [x, y] = [q.x, q.y];
      let t = 0;
      for (let i = 0; i < 3; i++) { t = g.flightTime(x, y) + (snipe ? P.blastDur * 0.2 : P.fuse * 0.5) + this.lag; [x, y] = this.predict(g, q, t); }
      if (busy(x, y)) continue;
      const n = snipe ? 1 : free.filter((o) => o.kind !== 'kirai' && Math.hypot(this.predict(g, o, t)[0] - x, this.predict(g, o, t)[1] - y) < P.lureR * 0.85).length;
      const toHouse = this.toHouse(g, q);
      const urgent = toHouse < q.speed * (t + P.fuse + 1.5);
      const score = n * 3 + (urgent ? 4 : 0) - toHouse / 200;
      const bestScore = best ? best.n * 3 + (best.urgent ? 4 : 0) : -Infinity;
      if (score > bestScore) best = { x, y, n, urgent, snipe };
    }
    if (!best) return [];
    // 弾は限られているので、1 体だけには(急ぎでなければ)使わない
    if (best.n < 2 && !best.urgent && !best.snipe) return [];
    return this.fire(best.x, best.y, best.snipe, think, miss);
  }

  private fire(x: number, y: number, arm: boolean, think: number, miss: number): Array<[number, number]> {
    x = Math.round(clamp(x + (this.rng.next() - 0.5) * miss, FIELD.x0 + 10, FIELD.x1 - 10));
    y = Math.round(clamp(y + (this.rng.next() - 0.5) * miss, FIELD.y0 + 10, FIELD.y1 - 10));
    this.cool = think + this.lag;
    if (arm) this.arms.push([x, y]);
    return [[x, y]];
  }

  /** t 秒後の位置(芯がまっすぐ進むとして。横揺れ・折れは無視 = 人間の読みと同じ程度) */
  private predict(g: Game, q: Ghost, t: number): [number, number] {
    if (this.noLead) t = 0;
    const [hx, hy] = g.goal(q);
    const dx = hx - q.bx, dy = hy - q.by, d = Math.hypot(dx, dy) || 1;
    const sp = q.speed * (1 + g.P.speedRamp * g.wave) * (q.kind === 'zig' ? 0.83 : 1);
    const s = Math.min(d, sp * t);
    return [q.bx + (dx / d) * s, q.by + (dy / d) * s];
  }

  private toHouse(g: Game, q: Ghost) {
    const h = g.houses[q.target];
    return Math.hypot(h.x - q.x, h.y - q.y);
  }
}
