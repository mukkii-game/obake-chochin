// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の起動確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく「提灯が着くまでの間におばけがどこへ進むか」を先読みして投げる。
import type { Game, Ghost } from './logic';
import { clamp, FIELD } from './logic';
import { Rng } from '../core/rng';

export class Bot {
  private cool = 0;
  private rng: Rng;
  /** 次に押す「即割り」の印 */
  private armAt: [number, number] | null = null;
  /** skill 0..1: 低いほど反応が遅く、狙いが雑。乱数はゲームと別にする(記録の再生がずれないように) */
  constructor(private skill = 0.8, seed = 1) { this.rng = new Rng(seed ^ 0x5bd1e995); }

  decide(g: Game): Array<[number, number]> {
    this.cool -= 1 / 60;
    if (this.cool > 0 || g.over) return [];
    const P = g.P;
    const react = 0.75 - this.skill * 0.6;

    // 0) 直前に投げた提灯の印を押して「着いたら即割る」にする
    if (this.armAt) { const a = this.armAt; this.armAt = null; this.cool = react * 0.5; return [a]; }

    // 1) 割りどき: 溜まった / 灯りが小さくなってきた / 家が危ない
    for (const l of g.lanterns) {
      if (l.flying) continue;
      const held = g.ghosts.filter((q) => q.held === l.id).length;
      const shrinking = l.age > P.lightBloom && l.r < P.lightMax * 0.35;
      if (held >= 5 || (held >= 1 && shrinking) || (held >= 2 && this.dangerNear(g, l.x, l.y))) {
        this.cool = react;
        return [[l.x, l.y]];
      }
    }

    // 2) 投げどき: 家に一番近い自由なおばけの「着く頃の位置」へ
    if (g.lanterns.length < P.maxLanterns) {
      const free = g.ghosts.filter((q) => q.held === 0);
      free.sort((a, b) => this.toHouse(g, a) - this.toHouse(g, b));
      for (const q of free) {
        // 光嫌いと、家の目前のおばけは「撃ち落とし」(着いたら即割る)。光が広がりきる頃の位置を狙う
        const snipe = q.kind === 'kirai' || this.toHouse(g, q) < 70;
        if (g.lanterns.some((l) => Math.hypot(l.tx - q.x, l.ty - q.y) < P.lightMax)) continue;
        let [x, y] = [q.x, q.y];
        const extra = snipe ? P.burstDur * 0.25 : P.lightBloom * 0.5;
        for (let i = 0; i < 3; i++) [x, y] = this.predict(g, q, g.flightTime(x, y) + extra);
        const miss = (1 - this.skill) * 70;
        x = clamp(x + (this.rng.next() - 0.5) * miss, FIELD.x0 + 10, FIELD.x1 - 10);
        y = clamp(y + (this.rng.next() - 0.5) * miss, FIELD.y0 + 10, FIELD.y1 - 10);
        if (g.lanterns.some((l) => Math.hypot((l.flying ? l.tx : l.x) - x, (l.flying ? l.ty : l.y) - y) <= P.tapR)) continue;
        this.cool = react + 0.2;
        if (snipe) { this.armAt = [x, y]; this.cool = react * 0.5; }
        return [[x, y]];
      }
    }
    return [];
  }

  /** おばけの芯が家へまっすぐ進むとして、t 秒後の位置(横揺れは無視 = 人間の読みと同じ程度) */
  private predict(g: Game, q: Ghost, t: number): [number, number] {
    const h = g.houses[q.target];
    const dx = h.x - q.bx, dy = h.y - q.by, d = Math.hypot(dx, dy) || 1;
    const sp = q.speed * (1 + g.P.speedRamp * (g.t / 60)) * (q.kind === 'hop' ? 0.9 : 1);
    const s = Math.min(d, sp * t);
    return [q.bx + (dx / d) * s, q.by + (dy / d) * s];
  }

  private toHouse(g: Game, q: Ghost) {
    const h = g.houses[q.target];
    return Math.hypot(h.x - q.x, h.y - q.y);
  }

  private dangerNear(g: Game, x: number, y: number) {
    return g.ghosts.some((q) => q.held === 0 && this.toHouse(g, q) < 50 && Math.hypot(q.x - x, q.y - y) < 140);
  }
}
