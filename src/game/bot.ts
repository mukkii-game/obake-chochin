// 自動プレイの bot。ゲームの中身だけを見て「どこをタップするか」を返す(描画なし)。
// ?auto=1 のデモ、CI の起動確認、tools/sim.mjs のバランス確認で共有する。
// 人間と同じく、群れの進む先を先読みして提灯を投げ、まわりを回る数と回る時間を見て割る。
// lag: 決めてから指が動くまでの遅れ(秒)。成績が lag で落ちない = 反射神経のゲームではない、の確認用。
import type { Game, Ghost } from './logic';
import { clamp, FIELD } from './logic';
import { Rng } from '../core/rng';

export class Bot {
  private cool = 0;
  private tapGap = 0;
  private frame = 0;
  private rng: Rng;
  /** 撃ち落とし用に投げた提灯の行き先(投げた直後に押して、着いたら割れるようにする) */
  private arms: Array<[number, number]> = [];
  /** 割ると決めて、指が動くのを待っている提灯 */
  private breaking = new Set<number>();
  private queue: Array<{ due: number; x: number; y: number }> = [];
  /** skill 0..1: 低いほど狙いが雑。乱数はゲームと別にする(記録の再生がずれないように) */
  constructor(private skill = 0.8, seed = 1, private lag = 0, private lagOn: 'all' | 'break' | 'launch' = 'all') { this.rng = new Rng(seed ^ 0x5bd1e995); }

  decide(g: Game): Array<[number, number]> {
    this.frame++;
    this.cool -= 1 / 60; this.tapGap -= 1 / 60;
    const out: Array<[number, number]> = [];
    while (this.queue.length && this.queue[0].due <= this.frame) { const q = this.queue.shift()!; out.push([q.x, q.y]); }
    for (const id of [...this.breaking]) if (!g.lanterns.some((l) => l.id === id)) this.breaking.delete(id);
    if (g.over || this.tapGap > 0) return out;
    const r = this.think(g);
    if (r.length) {
      this.tapGap = 0.12;
      const isBreak = g.lanterns.some((l) => !l.flying && Math.hypot(l.x - r[0][0], l.y - r[0][1]) <= g.P.tapR);
      const lagged = this.lagOn === 'all' || (this.lagOn === 'break') === isBreak;
      for (const [x, y] of r) {
        if (this.lag > 0 && lagged) this.queue.push({ due: this.frame + Math.round(this.lag * 60), x, y });
        else out.push([x, y]);
      }
    }
    return out;
  }

  private think(g: Game): Array<[number, number]> {
    const P = g.P;
    const react = 0.75 - this.skill * 0.6;
    const lead = P.blastDur * 0.25 * (0.4 + this.skill * 0.6);

    // 0) 撃ち落とし用に投げた提灯は、すぐ押して「着いたら割る」にする(着く瞬間に合わせる必要は無い)
    if (this.arms.length) { const a = this.arms.shift()!; return [a]; }

    // 1) 割りどき
    for (const l of g.lanterns) {
      if (l.flying) continue;
      if (this.breaking.has(l.id)) continue;
      const ring = g.ghosts.filter((q) => q.lure === l.id && q.dwell >= 0);
      if (!ring.length) {
        // 誰も寄ってこない提灯は、枠を空けるために割って片付ける
        const around = g.ghosts.some((q) => q.kind !== 'kirai' && Math.hypot(q.x - l.x, q.y - l.y) < P.lureR * 2);
        if (l.age > 5 && !around) { this.breaking.add(l.id); return [[l.x, l.y]]; }
        continue;
      }
      const coming = g.ghosts.filter((q) => q.lure === l.id && q.dwell < 0).length;
      const near = g.ghosts.filter((q) => q.lure === 0 && q.kind !== 'kirai' && Math.hypot(q.x - l.x, q.y - l.y) < P.lureR * 1.4).length;
      const minDwell = Math.min(...ring.map((q) => q.dwell));
      const waiting = coming + near > 0;
      // 十分に集まった / 一番古いおばけが離れそう / もう増えそうにない
      if (ring.length >= 5 || minDwell < 1.0 || (ring.length >= 3 && !waiting) || (ring.length >= 2 && !waiting && minDwell < 2.0)) {
        this.breaking.add(l.id);
        return [[l.x, l.y]];
      }
    }
    if (this.cool > 0) return [];

    // 2) 投げどき: 家に近い群れの「着く頃の位置」へ。弾は限られているので、2 体以上まとめて呼べる時だけ
    if (g.lanterns.length < P.maxLanterns && g.ammo > 0) {
      const free = g.ghosts.filter((q) => q.lure === 0);
      free.sort((a, b) => this.toHouse(g, a) - this.toHouse(g, b));
      for (const q of free.slice(0, 8)) {
        const snipe = q.kind === 'kirai' || this.toHouse(g, q) < 90;
        if (!snipe && g.lanterns.some((l) => Math.hypot(l.tx - q.x, l.ty - q.y) < P.lureR)) continue;
        let [x, y] = [q.x, q.y];
        let ft = 0;
        for (let i = 0; i < 3; i++) { ft = g.flightTime(x, y) + (snipe ? lead : 0); [x, y] = this.predict(g, q, ft); }
        const mates = free.filter((o) => o !== q && o.kind !== 'kirai').map((o) => this.predict(g, o, ft))
          .filter(([mx, my]) => Math.hypot(mx - x, my - y) < P.lureR * 0.8);
        if (!snipe) {
          if (mates.length < 1 && g.ammo > 2) continue;
          if (mates.length) {
            const cx = mates.reduce((s, m) => s + m[0], x) / (mates.length + 1), cy = mates.reduce((s, m) => s + m[1], y) / (mates.length + 1);
            x = cx; y = cy;
          }
        }
        const miss = (1 - this.skill) * 60;
        x = Math.round(clamp(x + (this.rng.next() - 0.5) * miss, FIELD.x0 + 10, FIELD.x1 - 10));
        y = Math.round(clamp(y + (this.rng.next() - 0.5) * miss, FIELD.y0 + 10, FIELD.y1 - 10));
        if (g.lanterns.some((l) => Math.hypot(l.x - x, l.y - y) <= P.tapR || Math.hypot(l.tx - x, l.ty - y) <= P.tapR)) continue;
        this.cool = Math.max(react + 0.2, this.lag + 0.15);
        if (snipe) this.arms.push([x, y]);
        return [[x, y]];
      }
    }
    return [];
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
