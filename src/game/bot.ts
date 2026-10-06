// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の起動確認、tools/sim.mjs のバランス確認で共有する。
import type { Game, Ghost } from './logic';
import { clamp, FIELD } from './logic';
import { Rng } from '../core/rng';

export class Bot {
  private cool = 0;
  private rng: Rng;
  /** skill 0..1: 低いほど反応が遅く、狙いが雑。乱数はゲームと別にする(記録の再生がずれないように) */
  constructor(private skill = 0.8, seed = 1) { this.rng = new Rng(seed ^ 0x5bd1e995); }

  decide(g: Game): Array<[number, number]> {
    this.cool -= 1 / 60;
    if (this.cool > 0 || g.over) return [];
    const P = g.P;
    const react = 0.45 - this.skill * 0.3;

    // 1) 割りどき: たくさん溜まった / もうすぐ燃え尽きる / 家が危ない
    for (const l of g.lanterns) {
      const held = g.ghosts.filter((q) => q.held === l.id).length;
      const remain = P.lanternLife - l.age;
      if (held >= 6 || (held >= 1 && remain < 1.0) || (held >= 3 && this.dangerNear(g, l.x, l.y))) {
        this.cool = react;
        return [[l.x, l.y]];
      }
    }

    // 2) 置きどき: 家に一番近い自由なおばけの、少し先に置く
    if (g.lanterns.length < P.maxLanterns) {
      const free = g.ghosts.filter((q) => q.held === 0 && q.kind !== 'kirai');
      free.sort((a, b) => this.toHouse(g, a) - this.toHouse(g, b));
      for (const q of free) {
        if (g.lanterns.some((l) => Math.hypot(l.x - q.x, l.y - q.y) < P.attractR * 1.2)) continue;
        const h = g.houses[q.target];
        const d = Math.hypot(h.x - q.x, h.y - q.y) || 1;
        const lead = Math.min(d * 0.5, 50);
        const miss = (1 - this.skill) * 40;
        const x = clamp(q.x + ((h.x - q.x) / d) * lead + (this.rng.next() - 0.5) * miss, FIELD.x0 + 10, FIELD.x1 - 10);
        const y = clamp(q.y + ((h.y - q.y) / d) * lead + (this.rng.next() - 0.5) * miss, FIELD.y0 + 10, FIELD.y1 - 10);
        // 既存の提灯を割ってしまう位置は避ける
        if (g.lanterns.some((l) => Math.hypot(l.x - x, l.y - y) <= P.tapR)) continue;
        this.cool = react + 0.25;
        return [[x, y]];
      }
    }
    return [];
  }

  private toHouse(g: Game, q: Ghost) {
    const h = g.houses[q.target];
    return Math.hypot(h.x - q.x, h.y - q.y);
  }

  private dangerNear(g: Game, x: number, y: number) {
    return g.ghosts.some((q) => q.held === 0 && this.toHouse(g, q) < 50 && Math.hypot(q.x - x, q.y - y) < 160);
  }
}
