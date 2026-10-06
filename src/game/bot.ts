// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の起動確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく、提灯が着く頃のおばけの位置を先読みして投げ、
// 吸い寄せられたおばけが提灯の所で一番重なる瞬間に割る。
import type { Game, Ghost, Lantern } from './logic';
import { clamp, FIELD } from './logic';
import { Rng } from '../core/rng';

export class Bot {
  private cool = 0;
  private tapGap = 0;
  private rng: Rng;
  /** 撃ち落とし用に投げた提灯の行き先(着く直前に割る) */
  private snipes: Array<[number, number]> = [];
  /** 提灯ごとの「少し先に光に入る数」の前回値 */
  private prev = new Map<number, number>();
  /** skill 0..1: 低いほど反応が遅く、狙いが雑。乱数はゲームと別にする(記録の再生がずれないように) */
  constructor(private skill = 0.8, seed = 1) { this.rng = new Rng(seed ^ 0x5bd1e995); }

  decide(g: Game): Array<[number, number]> {
    this.cool -= 1 / 60; this.tapGap -= 1 / 60;
    if (g.over || this.tapGap > 0) return [];
    const r = this.think(g);
    if (r.length) this.tapGap = 0.12;
    return r;
  }

  private think(g: Game): Array<[number, number]> {
    const P = g.P;
    const react = 0.75 - this.skill * 0.6;
    // 光が広がりきるまでの間に進む分を見越す(上手いほど正確)
    const lead = P.blastDur * 0.25 * (0.4 + this.skill * 0.6);

    // 1) 割りどき
    for (const l of g.lanterns) {
      if (l.flying) {
        const k = this.snipes.findIndex(([x, y]) => x === l.tx && y === l.ty);
        if (k >= 0 && l.flyDur - l.flyT < lead) { this.snipes.splice(k, 1); return [[l.tx, l.ty]]; }
        continue;
      }
      const n = this.countAt(g, l, lead);
      const before = this.prev.get(l.id) ?? 0;
      this.prev.set(l.id, n);
      // 重なりが最大を過ぎた / 十分に重なった / 家の目前の敵が入った
      if ((n >= 1 && n < before) || n >= 4 || (n >= 1 && this.dangerIn(g, l, lead))) return [[l.x, l.y]];
    }
    if (this.cool > 0) return [];

    // 2) 投げどき: 家に近いおばけの「着く頃の位置」へ
    if (g.lanterns.length < P.maxLanterns) {
      const free = g.ghosts.filter((q) => q.lure === 0);
      free.sort((a, b) => this.toHouse(g, a) - this.toHouse(g, b));
      for (const q of free.slice(0, 8)) {
        const snipe = q.kind === 'kirai' || this.toHouse(g, q) < 90;
        if (!snipe && g.lanterns.some((l) => Math.hypot(l.tx - q.x, l.ty - q.y) < P.lureR)) continue;
        let [x, y] = [q.x, q.y];
        for (let i = 0; i < 3; i++) [x, y] = this.predict(g, q, g.flightTime(x, y) + (snipe ? lead : 0.3));
        const miss = (1 - this.skill) * 60;
        x = Math.round(clamp(x + (this.rng.next() - 0.5) * miss, FIELD.x0 + 10, FIELD.x1 - 10));
        y = Math.round(clamp(y + (this.rng.next() - 0.5) * miss, FIELD.y0 + 10, FIELD.y1 - 10));
        if (g.lanterns.some((l) => Math.hypot(l.x - x, l.y - y) <= P.tapR || Math.hypot(l.tx - x, l.ty - y) <= P.tapR)) continue;
        this.cool = react + 0.2;
        if (snipe) this.snipes.push([x, y]);
        return [[x, y]];
      }
    }
    return [];
  }

  /** t 秒後に提灯の光(最大半径)に入っているおばけの数 */
  private countAt(g: Game, l: Lantern, t: number) {
    let n = 0;
    for (const q of g.ghosts) {
      const [x, y] = this.predict(g, q, t);
      if (Math.hypot(x - l.x, y - l.y) < g.P.blastR * 0.9) n++;
    }
    return n;
  }

  private dangerIn(g: Game, l: Lantern, t: number) {
    return g.ghosts.some((q) => {
      const [x, y] = this.predict(g, q, t);
      return Math.hypot(x - l.x, y - l.y) < g.P.blastR * 0.9 && this.toHouse(g, q) < 70;
    });
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
