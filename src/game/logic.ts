// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// 遊びの芯(ミサイルコマンドと同じく、サインに頼らず「見て、頭で読む」):
//   - タップした所へ、近くの家から提灯が飛んでいく。速さはいつも同じ(先を読んで置く)。
//   - 着いた提灯は灯ってそのまま下がる。時間切れは無い。
//   - 灯りの近くを通るおばけは提灯へ吸い寄せられ、提灯を通り抜けて、また家へ向かう。
//     だから提灯の所でおばけが重なるのは一瞬。
//   - もう一度タップで割る(飛んでいる最中でも割れる)。成仏の光はいつも同じ大きさ・同じ長さで広がって縮む。
//     重なった瞬間に割れば、まとめて巻き込める。成仏したおばけは小さな人魂になって弾け、連鎖する。
import { Rng } from '../core/rng';
import type { Params } from './params';

export const W = 960;
export const H = 540;
/** 巻物の紙の内側(遊べる範囲) */
export const FIELD = { x0: 70, y0: 46, x1: 890, y1: 494 };
export const DT = 1 / 60;
/** おばけの当たりの半径 */
export const GHOST_R = 10;

/** 家の位置。巻物の中ほどに、うねる道に沿って点在させる(下一列に並べない) */
export const HOUSE_POS: ReadonlyArray<[number, number]> = [
  [205, 246], [318, 318], [440, 228], [548, 300], [668, 238], [770, 322],
];

export type GhostKind = 'fuwa' | 'zig' | 'hop' | 'kirai';

export interface Ghost {
  id: number; kind: GhostKind;
  /** 当たり判定と表示の位置 */
  x: number; y: number;
  /** 進路の芯(行き先へまっすぐ向かう点)。揺れ・ジグザグはこの芯からの横ずれ */
  bx: number; by: number;
  face: number;
  speed: number; target: number; age: number; phase: number;
  /** 吸い寄せられている提灯の id。0 = 家へ向かう */
  lure: number;
  /** もう通り抜けた提灯(同じ提灯には二度寄らない) */
  passed: number[];
  hopT: number; dashT: number;
  /** 跳ぶ前の溜め 0..1(見た目用) */
  crouch: number;
  dead: boolean;
}
export interface Lantern {
  id: number;
  /** 飛び立った家の位置と、行き先 */
  sx: number; sy: number; tx: number; ty: number;
  x: number; y: number;
  flying: boolean; flyT: number; flyDur: number;
  /** 灯ってからの秒(見た目用) */
  age: number;
}
export interface Wisp { id: number; x: number; y: number; age: number; chain: number; vx: number; vy: number }
export interface House { x: number; y: number; lit: boolean; flash: number }
/** 成仏の光。広がって、少し留まり、縮む(ミサイルコマンドの爆発と同じ形) */
export interface Blast { x: number; y: number; maxR: number; age: number; dur: number; delay: number; chain: number; big: boolean; r: number }
export interface Chain { id: number; count: number; pts: number; lx: number; ly: number }

export type GameEvent =
  | { type: 'launch'; sx: number; sy: number; x: number; y: number }
  | { type: 'light'; x: number; y: number }
  | { type: 'deny'; x: number; y: number }
  | { type: 'break'; x: number; y: number }
  | { type: 'purify'; x: number; y: number; n: number; pts: number; kind: GhostKind }
  | { type: 'wispPop'; x: number; y: number }
  | { type: 'chainEnd'; x: number; y: number; n: number; pts: number }
  | { type: 'houseOut'; x: number; y: number; left: number }
  | { type: 'relight'; x: number; y: number; from: [number, number] }
  | { type: 'spawn'; x: number; y: number; kind: GhostKind }
  | { type: 'watch'; n: number }
  | { type: 'waveEnd'; n: number; bonus: number }
  | { type: 'over' };

/** 刻の合間の一息(秒) */
export const WAVE_PAUSE = 2.8;

/** 成仏の光の半径(age 秒目)。dur の 25% で広がりきり、40% 留まり、残りで縮む */
export function blastRadius(maxR: number, age: number, dur: number) {
  const k = age / dur;
  if (k <= 0) return 0;
  if (k < 0.25) return maxR * (1 - (1 - k / 0.25) ** 2);
  if (k < 0.65) return maxR;
  if (k < 1) return maxR * (1 - (k - 0.65) / 0.35);
  return 0;
}

export class Game {
  readonly rng: Rng;
  t = 0;
  frame = 0;
  score = 0;
  bestChain = 0;
  purified = 0;
  over = false;
  ghosts: Ghost[] = [];
  lanterns: Lantern[] = [];
  wisps: Wisp[] = [];
  blasts: Blast[] = [];
  chains = new Map<number, Chain>();
  houses: House[];
  events: GameEvent[] = [];
  /** 今の刻(0 始まり) */
  wave = 0;
  /** この刻でまだ出ていないおばけの数 */
  waveLeft = 0;
  /** 刻の合間の残り秒(0 なら刻の最中) */
  pause = 0;
  private nextId = 1;
  private salvoT = 1.0;

  constructor(seed: number, readonly P: Params) {
    this.rng = new Rng(seed);
    this.houses = HOUSE_POS.map(([x, y]) => ({ x, y, lit: true, flash: 0 }));
    this.waveLeft = this.waveSize(0);
  }

  waveSize(n: number) { return Math.round(this.P.waveBase + this.P.waveGrow * n); }

  get litCount() { return this.houses.filter((h) => h.lit).length; }

  /** 行き先に一番近い、灯りのついた家 */
  launchHouse(x: number, y: number): House | null {
    let best: House | null = null, bd = Infinity;
    for (const h of this.houses) {
      if (!h.lit) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /** 提灯が着くまでの秒(bot の先読み用にも公開) */
  flightTime(x: number, y: number): number {
    const h = this.launchHouse(x, y);
    return h ? Math.hypot(x - h.x, y - (h.y - 18)) / this.P.flySpeed : Infinity;
  }

  /** 1 タップ。提灯の近く → 割る(飛んでいても) / それ以外 → 飛ばす */
  tap(x: number, y: number) {
    if (this.over) return;
    x = Math.round(x); y = Math.round(y); // 記録(整数)と同じ値で動かす
    const P = this.P;
    let best: Lantern | null = null, bd = P.tapR;
    for (const l of this.lanterns) {
      const d = Math.min(Math.hypot(l.x - x, l.y - y), l.flying ? Math.hypot(l.tx - x, l.ty - y) : Infinity);
      if (d <= bd) { bd = d; best = l; }
    }
    if (best) { this.breakLantern(best); return; }
    x = clamp(x, FIELD.x0 + 8, FIELD.x1 - 8);
    y = clamp(y, FIELD.y0 + 8, FIELD.y1 - 8);
    const h = this.launchHouse(x, y);
    if (!h || this.lanterns.length >= P.maxLanterns) { this.events.push({ type: 'deny', x, y }); return; }
    const sy = h.y - 18;
    const flyDur = Math.max(0.08, Math.hypot(x - h.x, y - sy) / P.flySpeed);
    this.lanterns.push({ id: this.nextId++, sx: h.x, sy, tx: x, ty: y, x: h.x, y: sy, flying: true, flyT: 0, flyDur, age: 0 });
    this.events.push({ type: 'launch', sx: h.x, sy, x, y });
  }

  private breakLantern(l: Lantern) {
    const chain = this.newChain(l.x, l.y);
    this.addBlast(l.x, l.y, this.P.blastR, this.P.blastDur, 0, chain, true);
    this.lanterns = this.lanterns.filter((q) => q !== l);
    for (const g of this.ghosts) if (g.lure === l.id) this.resume(g);
    this.events.push({ type: 'break', x: l.x, y: l.y });
  }

  private addBlast(x: number, y: number, maxR: number, dur: number, delay: number, chain: Chain, big = false) {
    if (maxR <= 0) return;
    this.blasts.push({ x, y, maxR, age: 0, dur, delay, chain: chain.id, big, r: 0 });
  }

  /** 1/60 秒進める */
  step(taps: Array<[number, number]> = []) {
    if (this.over) return;
    for (const [x, y] of taps) this.tap(x, y);
    const P = this.P, dt = DT;
    this.t += dt; this.frame++;

    this.spawn(dt);

    for (const l of this.lanterns) {
      if (!l.flying) { l.age += dt; continue; }
      l.flyT += dt;
      const k = Math.min(1, l.flyT / l.flyDur);
      l.x = lerp(l.sx, l.tx, k); l.y = lerp(l.sy, l.ty, k);
      if (k >= 1) { l.flying = false; l.x = l.tx; l.y = l.ty; this.events.push({ type: 'light', x: l.x, y: l.y }); }
    }

    // 人魂(成仏したおばけ): ふわりと昇って、弾ける
    for (const s of this.wisps) {
      s.age += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.95; s.vy *= 0.95;
      if (s.age >= P.wispLife) {
        const c = this.chains.get(s.chain) ?? this.newChain(s.x, s.y);
        this.addBlast(s.x, s.y, P.wispPop, P.chainDur, 0, c);
        this.events.push({ type: 'wispPop', x: s.x, y: s.y });
      }
    }
    this.wisps = this.wisps.filter((s) => s.age < P.wispLife);

    this.moveGhosts(dt);
    this.runBlasts(dt);
    this.closeChains();

    for (const h of this.houses) h.flash = Math.max(0, h.flash - dt);

    let n = 0;
    for (const g of this.ghosts) if (!g.dead) this.ghosts[n++] = g;
    this.ghosts.length = n;

    if (this.litCount === 0) { this.over = true; this.events.push({ type: 'over' }); }
  }

  private resume(g: Ghost) {
    if (g.lure) g.passed.push(g.lure);
    g.lure = 0; g.bx = g.x; g.by = g.y;
    if (!this.houses[g.target].lit) g.target = this.pickTarget(g.x, g.y);
  }

  private newChain(x: number, y: number): Chain {
    const c: Chain = { id: this.nextId++, count: 0, pts: 0, lx: x, ly: y };
    this.chains.set(c.id, c);
    return c;
  }

  /** 刻ごとの波。数体ずつの「群れ」を同じ方角から放つ */
  private spawn(dt: number) {
    const P = this.P;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        this.wave++; this.waveLeft = this.waveSize(this.wave); this.salvoT = 0.8;
        this.events.push({ type: 'watch', n: this.wave });
      }
      return;
    }
    if (this.waveLeft <= 0) {
      if (this.ghosts.length === 0) {
        const bonus = this.litCount * P.waveBonus * (this.wave + 1);
        this.score += bonus;
        this.pause = WAVE_PAUSE;
        this.events.push({ type: 'waveEnd', n: this.wave, bonus });
      }
      return;
    }
    this.salvoT -= dt;
    if (this.salvoT > 0) return;
    const n = this.wave;
    this.salvoT = Math.max(P.salvoGapMin, P.salvoGap - 0.25 * n) * (0.8 + this.rng.next() * 0.4);
    const kinds: GhostKind[] = ['fuwa'];
    if (n >= 1) kinds.push('zig');
    if (n >= 2) kinds.push('hop');
    if (n >= 3) kinds.push('kirai');
    // 刻が進むと、別々の方角から同時に群れが来る
    const salvos = 1 + Math.floor(n / P.multiEvery);
    for (let k = 0; k < salvos && this.waveLeft > 0; k++) {
      const kind = this.rng.chance(0.3) ? 'fuwa' : this.rng.pick(kinds);
      const size = Math.min(this.waveLeft, this.rng.int(2, Math.min(5, 2 + Math.floor(n / 2))));
      const [ex, ey] = this.edgePoint();
      for (let i = 0; i < size; i++) {
        const gx = clamp(ex + (this.rng.next() - 0.5) * 70, FIELD.x0, FIELD.x1);
        const gy = clamp(ey + (this.rng.next() - 0.5) * 70, FIELD.y0, FIELD.y1);
        this.addGhost(kind === 'kirai' && i > 0 ? 'fuwa' : kind, gx, gy);
      }
      this.waveLeft -= size;
    }
  }

  /** 巻物の四辺のどこか */
  private edgePoint(): [number, number] {
    const side = this.rng.int(0, 3);
    const r = this.rng.next();
    if (side === 0) return [lerp(FIELD.x0, FIELD.x1, r), FIELD.y0];
    if (side === 1) return [lerp(FIELD.x0, FIELD.x1, r), FIELD.y1];
    if (side === 2) return [FIELD.x0, lerp(FIELD.y0, FIELD.y1, r)];
    return [FIELD.x1, lerp(FIELD.y0, FIELD.y1, r)];
  }

  addGhost(kind: GhostKind, x: number, y: number) {
    const mult = { fuwa: 1, zig: 1.15, hop: 0.75, kirai: 0.9 }[kind];
    const g: Ghost = {
      id: this.nextId++, kind, x, y, bx: x, by: y, face: 1,
      speed: this.P.ghostSpeed * mult,
      target: this.pickTarget(x, y), age: 0, phase: this.rng.next() * Math.PI * 2,
      lure: 0, passed: [],
      hopT: 1.2 + this.rng.next() * 1.0, dashT: 0, crouch: 0, dead: false,
    };
    this.ghosts.push(g);
    this.events.push({ type: 'spawn', x, y, kind });
    return g;
  }

  /** 灯りのついた家を、近いほど選ばれやすく */
  private pickTarget(x: number, y: number): number {
    const lit = this.houses.map((h, i) => ({ h, i })).filter((o) => o.h.lit);
    if (lit.length === 0) return 0;
    const ws = lit.map((o) => 1 / (60 + Math.hypot(o.h.x - x, o.h.y - y)) ** 2);
    let r = this.rng.next() * ws.reduce((a, b) => a + b, 0);
    for (let k = 0; k < lit.length; k++) { r -= ws[k]; if (r <= 0) return lit[k].i; }
    return lit[lit.length - 1].i;
  }

  /** おばけの今の行き先(吸い寄せている提灯、なければ家) */
  goal(g: Ghost): [number, number] {
    if (g.lure) { const l = this.lanterns.find((q) => q.id === g.lure); if (l) return [l.x, l.y]; }
    const h = this.houses[g.target];
    return [h.x, h.y];
  }

  private tryLure(g: Ghost) {
    if (g.kind === 'kirai') return;
    let best = 0, bd = this.P.lureR;
    for (const l of this.lanterns) {
      if (l.flying || g.passed.includes(l.id)) continue;
      const d = Math.hypot(l.x - g.x, l.y - g.y);
      if (d < bd) { bd = d; best = l.id; }
    }
    if (best) { g.lure = best; g.bx = g.x; g.by = g.y; }
  }

  private moveGhosts(dt: number) {
    const P = this.P;
    const ramp = 1 + P.speedRamp * this.wave;
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.age += dt;
      if (g.lure && !this.lanterns.some((l) => l.id === g.lure)) this.resume(g);
      if (!g.lure && !this.houses[g.target].lit) g.target = this.pickTarget(g.x, g.y);
      if (!g.lure) this.tryLure(g);
      const sp = g.speed * ramp;

      const [hx, hy] = this.goal(g);
      let dx = hx - g.bx, dy = hy - g.by;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;
      // 横ずれ(芯の線に対して垂直)。行き先に近づくほど小さくして、最後はまっすぐ入る
      const near = clamp(dist / 110, 0, 1);
      let off = 0, bsp = sp;
      switch (g.kind) {
        case 'fuwa':
          off = Math.sin(g.age * 1.6 + g.phase) * 30 * near;
          break;
        case 'zig': {
          const p = (g.age * 0.9 + g.phase) % 2;
          off = (p < 1 ? p * 2 - 1 : 3 - p * 2) * 38 * near;
          break;
        }
        case 'hop':
          if (g.dashT > 0) {
            g.dashT -= dt;
            bsp = P.hopDist / 0.2;
          } else {
            g.hopT -= dt;
            g.crouch = clamp(1 - g.hopT / 0.7, 0, 1);
            bsp = sp * 0.35;
            if (g.hopT <= 0) { g.dashT = 0.2; g.hopT = 1.8 + this.rng.next() * 1.0; g.crouch = 0; }
          }
          break;
        case 'kirai': {
          // 光を嫌う: 灯った提灯のまわりを避けて回り込む
          let px = 0, py = 0;
          for (const l of this.lanterns) {
            if (l.flying) continue;
            const lx = g.bx - l.x, ly = g.by - l.y, ld = Math.hypot(lx, ly) || 1;
            const edge = P.kiraiR;
            if (ld < edge) {
              const push = (edge - ld) / 30;
              const tx = -ly / ld, ty = lx / ld;
              const side = tx * dx + ty * dy >= 0 ? 1 : -1;
              px += (lx / ld) * push * 1.6 + tx * side * push;
              py += (ly / ld) * push * 1.6 + ty * side * push;
            }
          }
          g.bx += px * sp * dt * 1.5; g.by += py * sp * dt * 1.5;
          break;
        }
      }
      const stp = Math.min(dist, bsp * dt);
      g.bx += dx * stp; g.by += dy * stp;
      const nx = g.bx - dy * off, ny = g.by + dx * off;
      if (Math.abs(nx - g.x) > 0.3) g.face = nx < g.x ? -1 : 1;
      g.x = clamp(nx, FIELD.x0 - 10, FIELD.x1 + 10);
      g.y = clamp(ny, FIELD.y0 - 10, FIELD.y1 + 10);

      if (g.lure) {
        // 提灯を通り抜けたら、また家へ
        if (dist <= stp + 0.5) this.resume(g);
        continue;
      }
      const h = this.houses[g.target];
      if (Math.hypot(h.x - g.x, h.y - g.y) < 16 && h.lit) {
        h.lit = false; h.flash = 0.6; g.dead = true;
        this.events.push({ type: 'houseOut', x: h.x, y: h.y, left: this.litCount });
      }
    }
  }

  private runBlasts(dt: number) {
    const P = this.P;
    const added: Blast[] = [];
    for (const b of this.blasts) {
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.age += dt;
      b.r = blastRadius(b.maxR, b.age, b.dur);
      if (b.r <= 0) continue;
      const chain = this.chains.get(b.chain)!;
      for (const g of this.ghosts) {
        if (g.dead) continue;
        if (Math.hypot(g.x - b.x, g.y - b.y) > b.r + GHOST_R) continue;
        g.dead = true;
        chain.count++;
        const pts = P.basePts * chain.count;
        chain.pts += pts; this.score += pts; this.purified++;
        chain.lx = g.x; chain.ly = g.y;
        this.events.push({ type: 'purify', x: g.x, y: g.y, n: chain.count, pts, kind: g.kind });
        // 小さな成仏の光(連鎖)と、人魂
        added.push({ x: g.x, y: g.y, maxR: P.chainR, age: 0, dur: P.chainDur, delay: P.chainDelay, chain: chain.id, big: false, r: 0 });
        if (this.wisps.length < 40) {
          const a = this.rng.next() * Math.PI * 2;
          this.wisps.push({ id: this.nextId++, x: g.x, y: g.y, age: 0, chain: chain.id, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 30 });
        }
      }
    }
    this.blasts = this.blasts.filter((b) => b.delay > 0 || b.age < b.dur).concat(added);
  }

  /** 光も人魂も残っていない連鎖を締め、大連鎖なら家の灯りを戻す */
  private closeChains() {
    const alive = new Set<number>();
    for (const s of this.wisps) alive.add(s.chain);
    for (const b of this.blasts) alive.add(b.chain);
    for (const c of [...this.chains.values()]) {
      if (alive.has(c.id)) continue;
      this.chains.delete(c.id);
      if (c.count === 0) continue;
      this.bestChain = Math.max(this.bestChain, c.count);
      const last: [number, number] = [c.lx, c.ly];
      this.events.push({ type: 'chainEnd', x: last[0], y: last[1], n: c.count, pts: c.pts });
      if (c.count < this.P.relightAt) continue; // 1 回の連鎖で戻るのは 1 軒まで
      const dark = this.houses.filter((h) => !h.lit);
      if (!dark.length) continue;
      dark.sort((a, b) => Math.hypot(a.x - last[0], a.y - last[1]) - Math.hypot(b.x - last[0], b.y - last[1]));
      dark[0].lit = true; dark[0].flash = 0.8;
      this.events.push({ type: 'relight', x: dark[0].x, y: dark[0].y, from: last });
    }
  }

  /** 描画側が毎フレーム取り出す */
  drainEvents(): GameEvent[] { const e = this.events; this.events = []; return e; }
}

export function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** タップの入力文字列 "x,y;x,y;" ⇔ 座標 */
export function encodeTaps(taps: Array<[number, number]>) { return taps.map(([x, y]) => `${Math.round(x)},${Math.round(y)};`).join(''); }
export function decodeTaps(s: string): Array<[number, number]> {
  return s.split(';').filter(Boolean).map((p) => { const [x, y] = p.split(',').map(Number); return [x, y] as [number, number]; });
}
