// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// 遊びの芯(ミサイルコマンドから借りた骨組み):
//   タップした所へ、近くの家から提灯が「飛んでいく」(着くまで時間がかかる → 先を読んで置く)。
//   着いた提灯は灯りがパッと広がり、だんだん縮んで消える(灯りの大きさ = 残り時間)。
//   灯りに触れたおばけは提灯に吸い寄せられる。もう一度タップで割ると、広がって縮む「成仏の光」が出る。
//   成仏したおばけからも小さな成仏の光が出て、固まっていれば連鎖する。
//   飛んでいる提灯の行き先(印)をタップすると「着いたら即割る」(寄せずに撃ち落とす)。
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
  /** 進路の芯(家へまっすぐ向かう点)。揺れ・ジグザグはこの芯からの横ずれ */
  bx: number; by: number;
  face: number;
  speed: number; target: number; age: number; phase: number;
  /** 寄せられている灯りの id(提灯は正、味方の灯りは負)。0 = 自由 */
  held: number;
  orbitA: number;
  hopT: number; dashT: number;
  /** 跳ぶ前の溜め 0..1(見た目と、着地点の予告に使う) */
  crouch: number;
  dead: boolean;
}
export interface Lantern {
  id: number;
  /** 飛び立った家の位置と、行き先(印) */
  sx: number; sy: number; tx: number; ty: number;
  x: number; y: number;
  flying: boolean; flyT: number; flyDur: number;
  /** 着いたら即割る */
  armed: boolean;
  /** 灯ってからの秒 */
  age: number;
  /** 今の灯りの半径 */
  r: number;
  held: number;
}
export interface Wisp { id: number; x: number; y: number; age: number; chain: number; vx: number; vy: number }
export interface House { x: number; y: number; lit: boolean; flash: number }
/** 成仏の光。広がって、少し留まり、縮む(ミサイルコマンドの爆発と同じ形) */
export interface Blast { x: number; y: number; maxR: number; age: number; dur: number; delay: number; chain: number; big: boolean; r: number }
export interface Chain { id: number; count: number; pts: number; lx: number; ly: number }

export type GameEvent =
  | { type: 'launch'; sx: number; sy: number; x: number; y: number }
  | { type: 'arm'; x: number; y: number }
  | { type: 'light'; x: number; y: number }
  | { type: 'deny'; x: number; y: number }
  | { type: 'break'; x: number; y: number; held: number; r: number }
  | { type: 'fizzle'; x: number; y: number; held: number }
  | { type: 'catch'; x: number; y: number }
  | { type: 'purify'; x: number; y: number; n: number; pts: number; kind: GhostKind }
  | { type: 'wispPop'; x: number; y: number }
  | { type: 'chainEnd'; x: number; y: number; n: number; pts: number }
  | { type: 'houseOut'; x: number; y: number; left: number }
  | { type: 'relight'; x: number; y: number; from: [number, number] }
  | { type: 'spawn'; x: number; y: number; kind: GhostKind }
  | { type: 'watch'; n: number }
  | { type: 'over' };

/** 夜の刻み(秒) */
export const WATCH_SEC = 30;

/** 成仏の光の半径(age 秒目)。dur の 30% で広がりきり、30% 留まり、残りで縮む */
export function blastRadius(maxR: number, age: number, dur: number) {
  const k = age / dur;
  if (k <= 0) return 0;
  if (k < 0.3) return maxR * (1 - (1 - k / 0.3) ** 2);
  if (k < 0.6) return maxR;
  if (k < 1) return maxR * (1 - (k - 0.6) / 0.4);
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
  private nextId = 1;
  private spawnAcc = 0.6;
  private watch = 0;

  constructor(seed: number, readonly P: Params) {
    this.rng = new Rng(seed);
    this.houses = HOUSE_POS.map(([x, y]) => ({ x, y, lit: true, flash: 0 }));
  }

  get litCount() { return this.houses.filter((h) => h.lit).length; }

  /** 提灯が着くまでの秒(bot の先読み用にも公開) */
  flightTime(x: number, y: number): number {
    const h = this.launchHouse(x, y);
    if (!h) return Infinity;
    return Math.hypot(x - h.x, y - h.y) / this.P.flySpeed;
  }

  /** 行き先に一番近い、灯りのついた家から飛ばす */
  launchHouse(x: number, y: number): House | null {
    let best: House | null = null, bd = Infinity;
    for (const h of this.houses) {
      if (!h.lit) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /** 1 タップ。灯った提灯の近く → 割る / 飛んでいる提灯の印の近く → 着いたら割る / それ以外 → 飛ばす */
  tap(x: number, y: number) {
    if (this.over) return;
    x = Math.round(x); y = Math.round(y); // 記録(整数)と同じ値で動かす
    const P = this.P;
    let best: Lantern | null = null, bd = P.tapR;
    for (const l of this.lanterns) {
      const d = l.flying ? Math.hypot(l.tx - x, l.ty - y) : Math.hypot(l.x - x, l.y - y);
      if (d <= bd) { bd = d; best = l; }
    }
    if (best) {
      if (!best.flying) this.breakLantern(best);
      else if (!best.armed) { best.armed = true; this.events.push({ type: 'arm', x: best.tx, y: best.ty }); }
      return;
    }
    x = clamp(x, FIELD.x0 + 8, FIELD.x1 - 8);
    y = clamp(y, FIELD.y0 + 8, FIELD.y1 - 8);
    const h = this.launchHouse(x, y);
    if (!h || this.lanterns.length >= P.maxLanterns) { this.events.push({ type: 'deny', x, y }); return; }
    const sy = h.y - 18;
    const flyDur = Math.max(0.08, Math.hypot(x - h.x, y - sy) / P.flySpeed);
    this.lanterns.push({ id: this.nextId++, sx: h.x, sy, tx: x, ty: y, x: h.x, y: sy, flying: true, flyT: 0, flyDur, armed: false, age: 0, r: 0, held: 0 });
    this.events.push({ type: 'launch', sx: h.x, sy, x, y });
  }

  private breakLantern(l: Lantern) {
    const held = this.ghosts.filter((g) => g.held === l.id && !g.dead).length;
    const chain = this.newChain(l.x, l.y);
    const r = this.P.burstR + this.P.burstLight * l.r + this.P.burstPer * held;
    this.addBlast(l.x, l.y, r, this.P.burstDur, 0, chain, true);
    this.lanterns = this.lanterns.filter((q) => q !== l);
    for (const g of this.ghosts) if (g.held === l.id) g.held = 0;
    this.events.push({ type: 'break', x: l.x, y: l.y, held, r });
  }

  private addBlast(x: number, y: number, maxR: number, dur: number, delay: number, chain: Chain, big = false) {
    if (maxR <= 0) return;
    this.blasts.push({ x, y, maxR, age: 0, dur, delay, chain: chain.id, big, r: 0 });
  }

  /** 灯りの半径(灯ってから age 秒)。すぐ広がり、あとは一定の速さで縮む */
  lightRadius(age: number) {
    const P = this.P;
    if (age < P.lightBloom) return P.lightMax * (age / P.lightBloom);
    return Math.max(0, P.lightMax * (1 - (age - P.lightBloom) / (P.lightLife - P.lightBloom)));
  }

  /** 1/60 秒進める */
  step(taps: Array<[number, number]> = []) {
    if (this.over) return;
    for (const [x, y] of taps) this.tap(x, y);
    const P = this.P, dt = DT;
    this.t += dt; this.frame++;

    const w = Math.floor(this.t / WATCH_SEC);
    if (w !== this.watch) { this.watch = w; this.events.push({ type: 'watch', n: w }); }

    this.spawn(dt);

    // 提灯: 飛ぶ → 灯る → 縮んで消える
    for (const l of [...this.lanterns]) {
      if (l.flying) {
        l.flyT += dt;
        const k = Math.min(1, l.flyT / l.flyDur);
        l.x = lerp(l.sx, l.tx, k); l.y = lerp(l.sy, l.ty, k);
        if (k >= 1) {
          l.flying = false; l.x = l.tx; l.y = l.ty;
          if (l.armed) { this.breakLantern(l); continue; }
          this.events.push({ type: 'light', x: l.x, y: l.y });
        }
        continue;
      }
      l.age += dt;
      l.r = this.lightRadius(l.age);
      if (l.age >= P.lightLife) {
        const held = this.ghosts.filter((g) => g.held === l.id).length;
        for (const g of this.ghosts) if (g.held === l.id) this.release(g);
        this.lanterns = this.lanterns.filter((q) => q !== l);
        this.events.push({ type: 'fizzle', x: l.x, y: l.y, held });
      }
    }
    for (const l of this.lanterns) l.held = 0;

    // 味方の灯り: ふわりと昇り、時間が来たら弾けて周りを成仏させる
    for (const s of this.wisps) {
      s.age += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.96; s.vy *= 0.96;
      if (s.age >= P.wispLife) {
        const c = this.chains.get(s.chain) ?? this.newChain(s.x, s.y);
        this.addBlast(s.x, s.y, P.wispPop, P.chainDur, 0, c);
        for (const g of this.ghosts) if (g.held === -s.id) this.release(g);
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

  private release(g: Ghost) {
    g.held = 0; g.bx = g.x; g.by = g.y;
  }

  private newChain(x: number, y: number): Chain {
    const c: Chain = { id: this.nextId++, count: 0, pts: 0, lx: x, ly: y };
    this.chains.set(c.id, c);
    return c;
  }

  private spawn(dt: number) {
    const P = this.P, t = this.t;
    const rate = P.rate0 + P.rateGrow * (t / 60);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.ghosts.length >= 140) continue;
      const kinds: GhostKind[] = ['fuwa'];
      if (t >= P.zigAt) kinds.push('zig');
      if (t >= P.hopAt) kinds.push('hop');
      if (t >= P.kiraiAt) kinds.push('kirai');
      const kind = this.rng.chance(0.35) ? 'fuwa' : this.rng.pick(kinds);
      const group = t >= P.groupAt && this.rng.chance(Math.min(0.5, 0.15 + (t - P.groupAt) / 400)) ? this.rng.int(2, 4) : 1;
      const [ex, ey] = this.edgePoint();
      for (let i = 0; i < group; i++) {
        const gx = clamp(ex + (this.rng.next() - 0.5) * 60, FIELD.x0, FIELD.x1);
        const gy = clamp(ey + (this.rng.next() - 0.5) * 60, FIELD.y0, FIELD.y1);
        this.addGhost(group > 1 && i > 0 ? 'fuwa' : kind, gx, gy);
      }
      this.spawnAcc -= (group - 1) * 0.5;
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
      speed: this.P.ghostSpeed * mult * (0.9 + this.rng.next() * 0.2),
      target: this.pickTarget(x, y), age: 0, phase: this.rng.next() * Math.PI * 2,
      held: 0, orbitA: 0,
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

  /** 跳ねる唐傘の着地点(溜めている間の予告に使う) */
  hopLanding(g: Ghost): [number, number] {
    const h = this.houses[g.target];
    const dx = h.x - g.bx, dy = h.y - g.by, d = Math.hypot(dx, dy) || 1;
    const jump = Math.min(d, this.P.hopDist);
    return [g.bx + (dx / d) * jump, g.by + (dy / d) * jump];
  }

  private moveGhosts(dt: number) {
    const P = this.P;
    const ramp = 1 + P.speedRamp * (this.t / 60);
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.age += dt;
      if (!this.houses[g.target].lit) g.target = this.pickTarget(g.x, g.y);
      const sp = g.speed * ramp;

      if (g.held > 0 && !this.lanterns.some((l) => l.id === g.held)) this.release(g);
      if (g.held < 0 && !this.wisps.some((s) => -s.id === g.held)) this.release(g);
      if (g.held === 0) this.tryCatch(g);

      if (g.held !== 0) {
        const lan = g.held > 0 ? this.lanterns.find((l) => l.id === g.held)! : null;
        const c = lan ?? this.wisps.find((s) => -s.id === g.held)!;
        if (lan) lan.held++;
        // 灯りが縮むほど輪も縮み、固まっていく(連鎖しやすくなる)
        const orbit = lan ? Math.min(P.orbitR, lan.r * 0.55) : P.orbitR * 0.5;
        g.orbitA += dt * (2 + (g.id % 5) * 0.15) * (g.id % 2 ? 1 : -1);
        const tx = c.x + Math.cos(g.orbitA) * orbit;
        const ty = c.y + Math.sin(g.orbitA) * orbit * 0.8;
        const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
        const v = Math.max(sp * 2.5, 70);
        if (d > 0.01) {
          const m = Math.min(d, v * dt) / d;
          g.x += dx * m; g.y += dy * m;
          if (Math.abs(dx) > 0.5) g.face = dx < 0 ? -1 : 1;
        }
        g.bx = g.x; g.by = g.y; g.crouch = 0; g.dashT = 0;
        continue;
      }

      const h = this.houses[g.target];
      let dx = h.x - g.bx, dy = h.y - g.by;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;
      // 横ずれ(芯の線に対して垂直)。家に近づくほど小さくして、最後は家に入る
      const near = clamp(dist / 120, 0, 1);
      let off = 0, bsp = sp;
      switch (g.kind) {
        case 'fuwa':
          // ふらふら: ゆっくりした波
          off = Math.sin(g.age * 1.6 + g.phase) * 34 * near;
          break;
        case 'zig': {
          // ジグザグ: 三角波(一定のリズムで折れる)
          const p = (g.age * 0.9 + g.phase) % 2;
          off = (p < 1 ? p * 2 - 1 : 3 - p * 2) * 42 * near;
          break;
        }
        case 'hop':
          // 跳ぶ: ゆっくり進み、溜めてから一気に跳ぶ(着地点は予告される)
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
          // 光を嫌う: 灯りの縁を回り込む(芯ごと押し出す)
          let px = 0, py = 0;
          for (const l of this.lanterns) {
            if (l.flying) continue;
            const lx = g.bx - l.x, ly = g.by - l.y, ld = Math.hypot(lx, ly) || 1;
            const edge = l.r + 26;
            if (ld < edge) {
              const push = (edge - ld) / 26;
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
      const step = Math.min(dist, bsp * dt);
      g.bx += dx * step; g.by += dy * step;
      const nx = g.bx - dy * off, ny = g.by + dx * off;
      if (Math.abs(nx - g.x) > 0.3) g.face = nx < g.x ? -1 : 1;
      g.x = clamp(nx, FIELD.x0 - 10, FIELD.x1 + 10);
      g.y = clamp(ny, FIELD.y0 - 10, FIELD.y1 + 10);

      if (Math.hypot(h.x - g.x, h.y - g.y) < 16 && h.lit) {
        h.lit = false; h.flash = 0.6; g.dead = true;
        this.events.push({ type: 'houseOut', x: h.x, y: h.y, left: this.litCount });
      }
    }
  }

  /** 灯りに触れたら捕まる。光嫌いは提灯には捕まらず、味方の灯りにだけ寄る */
  private tryCatch(g: Ghost) {
    const P = this.P;
    let best = 0, bd = Infinity;
    if (g.kind !== 'kirai') {
      for (const l of this.lanterns) {
        if (l.flying) continue;
        const d = Math.hypot(l.x - g.x, l.y - g.y);
        if (d < l.r + GHOST_R && d < bd) { bd = d; best = l.id; }
      }
    }
    for (const s of this.wisps) {
      if (s.age < 0.2) continue;
      const d = Math.hypot(s.x - g.x, s.y - g.y);
      if (d < P.wispAttract && d < bd) { bd = d; best = -s.id; }
    }
    if (best !== 0) {
      g.held = best;
      const c = best > 0 ? this.lanterns.find((l) => l.id === best)! : this.wisps.find((s) => -s.id === best)!;
      g.orbitA = Math.atan2(g.y - c.y, g.x - c.x);
      if (best > 0) this.events.push({ type: 'catch', x: g.x, y: g.y });
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
        // 次の成仏の光(連鎖)と、味方の灯り
        added.push({ x: g.x, y: g.y, maxR: P.chainR, age: 0, dur: P.chainDur, delay: P.chainDelay, chain: chain.id, big: false, r: 0 });
        if (this.wisps.length < 60) {
          const a = this.rng.next() * Math.PI * 2;
          this.wisps.push({ id: this.nextId++, x: g.x, y: g.y, age: 0, chain: chain.id, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 25 });
        }
      }
    }
    this.blasts = this.blasts.filter((b) => b.delay > 0 || b.age < b.dur).concat(added);
  }

  /** 光も灯りも残っていない連鎖を締め、大連鎖なら家の灯りを戻す */
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
      let relights = c.count >= this.P.relightAt ? 1 : 0; // 1 回の連鎖で戻るのは 1 軒まで
      while (relights-- > 0) {
        const dark = this.houses.filter((h) => !h.lit);
        if (!dark.length) break;
        dark.sort((a, b) => Math.hypot(a.x - last[0], a.y - last[1]) - Math.hypot(b.x - last[0], b.y - last[1]));
        dark[0].lit = true; dark[0].flash = 0.8;
        this.events.push({ type: 'relight', x: dark[0].x, y: dark[0].y, from: last });
      }
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
