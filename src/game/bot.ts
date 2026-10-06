// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の起動確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく、提灯が着く頃のおばけの位置を先読みして投げ、
// 「呼び寄せたおばけが提灯に着く直前」まで溜めてから割る。
import type { Game, Ghost, Lantern } from './logic';
import { clamp, FIELD, EAT_R } from './logic';
import { Rng } from '../core/rng';

export class Bot {
  private cool = 0;
  private rng: Rng;
  /** 次に押す「即割り」の印 */
  private armAt: [number, number] | null = null;
  /** skill 0..1: 低いほど反応が遅く、狙いが雑。乱数はゲームと別にする(記録の再生がずれないように) */
  constructor(private skill = 0.8, seed = 1) { this.rng = new Rng(seed ^ 0x5bd1e995); }

  private tapGap = 0;

  decide(g: Game): Array<[number, number]> {
    this.cool -= 1 / 60; this.tapGap -= 1 / 60;
    if (g.over || this.tapGap > 0) return [];
    const r = this.decide2(g);
    if (r.length) this.tapGap = 0.12;
    return r;
  }

  private decide2(g: Game): Array<[number, number]> {
    const P = g.P;
    const react = 0.75 - this.skill * 0.6;

    // 0) 直前に投げた提灯の印を押して「着いたら即割る」にする
    if (this.armAt) { const a = this.armAt; this.armAt = null; return [a]; }

    // 1) 割りどき: 先頭のおばけが着く直前 / 輪の中に十分いる(近づいてくるのは見えているので、反応の遅さは関係ない)
    for (const l of g.lanterns) {
      if (l.flying) continue;
      const inside = g.insideCount(l);
      const eta = this.firstArrival(g, l);
      const margin = 0.2 + (1 - this.skill) * 0.3;
      if ((inside >= 1 && eta < margin) || inside >= 6 || (inside >= 3 && l.r >= P.burstMax - 1)) {
        return [[l.x, l.y]];
      }
    }
    if (this.cool > 0) return [];

    // 2) 投げどき: 家に近い自由なおばけの「着く頃の位置」へ。まわりに仲間が多い所を優先
    if (g.lanterns.length < P.maxLanterns) {
      const free = g.ghosts.filter((q) => q.lure === 0);
      free.sort((a, b) => this.toHouse(g, a) - this.toHouse(g, b));
      for (const q of free.slice(0, 8)) {
        const snipe = q.kind === 'kirai' || this.toHouse(g, q) < 80;
        if (!snipe && g.lanterns.some((l) => Math.hypot(l.tx - q.x, l.ty - q.y) < P.lureR)) continue;
        let [x, y] = [q.x, q.y];
        const extra = snipe ? P.burstDur * 0.2 : 0;
        for (let i = 0; i < 3; i++) [x, y] = this.predict(g, q, g.flightTime(x, y) + extra);
        if (!snipe) {
          // 仲間の重心へ少し寄せる(まとめて呼ぶため)
          const mates = free.filter((o) => o !== q && Math.hypot(o.x - x, o.y - y) < P.lureR * 1.4);
          if (mates.length) {
            const cx = mates.reduce((s, o) => s + o.x, 0) / mates.length, cy = mates.reduce((s, o) => s + o.y, 0) / mates.length;
            x = x * 0.7 + cx * 0.3; y = y * 0.7 + cy * 0.3;
          }
        }
        const miss = (1 - this.skill) * 60;
        x = clamp(x + (this.rng.next() - 0.5) * miss, FIELD.x0 + 10, FIELD.x1 - 10);
        y = clamp(y + (this.rng.next() - 0.5) * miss, FIELD.y0 + 10, FIELD.y1 - 10);
        if (g.lanterns.some((l) => Math.hypot((l.flying ? l.tx : l.x) - x, (l.flying ? l.ty : l.y) - y) <= P.tapR)) continue;
        this.cool = react + 0.2;
        if (snipe) this.armAt = [x, y];
        return [[x, y]];
      }
    }
    return [];
  }

  /** 呼び寄せたおばけのうち、一番早く提灯に着くまでの秒 */
  private firstArrival(g: Game, l: Lantern) {
    let best = Infinity;
    const ramp = 1 + g.P.speedRamp * g.wave;
    for (const q of g.ghosts) {
      if (q.lure !== l.id) continue;
      const d = Math.hypot(q.x - l.x, q.y - l.y) - EAT_R;
      const sp = q.speed * ramp * g.P.lureSpeed * (q.kind === 'hop' ? 2 : 1);
      best = Math.min(best, d / sp + Math.max(0, q.stun));
    }
    return best;
  }

  /** おばけの芯がまっすぐ進むとして、t 秒後の位置(横揺れは無視 = 人間の読みと同じ程度) */
  private predict(g: Game, q: Ghost, t: number): [number, number] {
    const [hx, hy] = g.goal(q);
    const dx = hx - q.bx, dy = hy - q.by, d = Math.hypot(dx, dy) || 1;
    const sp = q.speed * (1 + g.P.speedRamp * g.wave) * (q.kind === 'hop' ? 0.9 : 1);
    const s = Math.min(d, sp * t);
    return [q.bx + (dx / d) * s, q.by + (dy / d) * s];
  }

  private toHouse(g: Game, q: Ghost) {
    const h = g.houses[q.target];
    return Math.hypot(h.x - q.x, h.y - q.y);
  }
}
