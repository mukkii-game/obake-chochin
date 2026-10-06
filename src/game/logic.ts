// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// 遊びの芯(ミサイルコマンドの「ちょうどいい所と時に爆発させて、まとめて巻き込む」):
//   1. タップした所へ、近くの家から提灯が飛んでいく(着くまで時間がかかる → 先を読んで置く)。
//   2. 着いた提灯は灯り、周りのおばけを呼び寄せる(寄せ範囲に入ったおばけは提灯へ向かってくる)。
//   3. 提灯の周りには「今割ったら巻き込む範囲」の輪が出ていて、灯っている間だんだん大きくなる。
//   4. 最初の 1 体が提灯に触れたら、提灯は食われて消える。だから
//      「十分に集まった、でもまだ誰も着いていない」その一瞬に、もう一度タップして割る。
//   5. 割ると成仏の光(広がって・留まって・縮む)。成仏したおばけからも小さな光が出て連鎖する。
//   飛んでいる提灯の印をタップすると、着いた瞬間に割れる(寄せずに撃ち落とす)。
import { Rng } from '../core/rng';
import type { Params } from './params';

export const W = 960;
export const H = 540;
/** 巻物の紙の内側(遊べる範囲) */
export const FIELD = { x0: 70, y0: 46, x1: 890, y1: 494 };
export const DT = 1 / 60;
/** おばけの当たりの半径 */
export const GHOST_R = 10;
/** おばけが提灯に触れた(食った)とみなす距離 */
export const EAT_R = 14;

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
  /** 呼び寄せている灯りの id(提灯は正、味方の灯りは負)。0 = 家へ向かう */
  lure: number;
  hopT: number; dashT: number;
  /** 跳ぶ前の溜め 0..1(見た目と、着地点の予告に使う) */
  crouch: number;
  /** 目がくらんで止まっている残り秒(提灯が目の前に灯った時) */
  stun: number;
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
  /** 今割ったら巻き込む半径(灯っている間に育つ) */
  r: number;
  /** 誰も呼べていない秒(長く続くと消える) */
  idle: number;
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
  | { type: 'break'; x: number; y: number; r: number; inside: number }
  | { type: 'eaten'; x: number; y: number }
  | { type: 'fade'; x: number; y: number }
  | { type: 'purify'; x: number; y: number; n: number; pts: number; kind: GhostKind }
  | { type: 'wispPop'; x: number; y: number }
  | { type: 'chainEnd'; x: number; y: number; n: number; pts: number }
  | { type: 'houseOut'; x: number; y: number; left: number }
  | { type: 'relight'; x: number; y: number; from: [number, number] }
  | { type: 'spawn'; x: number; y: number; kind: GhostKind }
  | { type: 'watch'; n: number }
  | { type: 'waveEnd'; n: number; bonus: number }
  | { type: 'over' };

/** 夜は「刻」ごとの波で来る(ミサイルコマンドの攻撃波と同じ)。刻の合間に一息つける */
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
  private nextId = 1;
  /** 今の刻(0 始まり) */
  wave = 0;
  /** この刻でまだ出ていないおばけの数 */
  waveLeft = 0;
  private salvoT = 1.0;
  /** 刻の合間の残り秒(0 なら刻の最中) */
  pause = 0;

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

  /** 今割ったら巻き込む半径(灯って age 秒) */
  chargeRadius(age: number) {
    const P = this.P;
    return P.burstMin + (P.burstMax - P.burstMin) * clamp(age / P.chargeTime, 0, 1);
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
    this.lanterns.push({ id: this.nextId++, sx: h.x, sy, tx: x, ty: y, x: h.x, y: sy, flying: true, flyT: 0, flyDur, armed: false, age: 0, r: P.burstMin, idle: 0 });
    this.events.push({ type: 'launch', sx: h.x, sy, x, y });
  }

  /** 今割ったら巻き込むおばけの数(描画の「×n」と bot が使う) */
  insideCount(l: Lantern) {
    let n = 0;
    for (const g of this.ghosts) if (!g.dead && Math.hypot(g.x - l.x, g.y - l.y) <= l.r + GHOST_R) n++;
    return n;
  }

  private breakLantern(l: Lantern) {
    const inside = this.insideCount(l);
    const chain = this.newChain(l.x, l.y);
    this.addBlast(l.x, l.y, l.r, this.P.burstDur, 0, chain, true);
    this.dropLantern(l);
    this.events.push({ type: 'break', x: l.x, y: l.y, r: l.r, inside });
  }

  private dropLantern(l: Lantern) {
    this.lanterns = this.lanterns.filter((q) => q !== l);
    for (const g of this.ghosts) if (g.lure === l.id) this.unlure(g);
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

    // 提灯: 飛ぶ → 灯る(割れる範囲が育つ)
    for (const l of [...this.lanterns]) {
      if (l.flying) {
        l.flyT += dt;
        const k = Math.min(1, l.flyT / l.flyDur);
        l.x = lerp(l.sx, l.tx, k); l.y = lerp(l.sy, l.ty, k);
        if (k >= 1) {
          l.flying = false; l.x = l.tx; l.y = l.ty;
          if (l.armed) { this.breakLantern(l); continue; }
          this.events.push({ type: 'light', x: l.x, y: l.y });
          // 目の前に灯ったおばけは、一瞬目がくらんで止まる(ぴったり狙えたごほうび)
          for (const g of this.ghosts) {
            if (g.kind !== 'kirai' && Math.hypot(g.x - l.x, g.y - l.y) < P.burstMin + GHOST_R) { g.stun = P.stun; g.lure = l.id; g.bx = g.x; g.by = g.y; }
          }
        }
        continue;
      }
      l.age += dt;
      l.r = this.chargeRadius(l.age);
      // 誰も呼べないまま放っておくと、静かに消える(枠が空く)
      l.idle = this.ghosts.some((g) => g.lure === l.id) ? 0 : l.idle + dt;
      if (l.idle >= P.idleLife) { this.dropLantern(l); this.events.push({ type: 'fade', x: l.x, y: l.y }); }
    }

    // 味方の灯り: ふわりと漂い、時間が来るか、おばけが触れたら弾ける
    for (const s of this.wisps) {
      s.age += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.96; s.vy *= 0.96;
    }

    this.moveGhosts(dt);

    for (const s of [...this.wisps]) {
      if (s.age < P.wispLife) continue;
      this.popWisp(s);
    }

    this.runBlasts(dt);
    this.closeChains();

    for (const h of this.houses) h.flash = Math.max(0, h.flash - dt);

    let n = 0;
    for (const g of this.ghosts) if (!g.dead) this.ghosts[n++] = g;
    this.ghosts.length = n;

    if (this.litCount === 0) { this.over = true; this.events.push({ type: 'over' }); }
  }

  private popWisp(s: Wisp) {
    const c = this.chains.get(s.chain) ?? this.newChain(s.x, s.y);
    this.addBlast(s.x, s.y, this.P.wispPop, this.P.chainDur, 0, c);
    this.wisps = this.wisps.filter((q) => q !== s);
    for (const g of this.ghosts) if (g.lure === -s.id) this.unlure(g);
    this.events.push({ type: 'wispPop', x: s.x, y: s.y });
  }

  private unlure(g: Ghost) {
    g.lure = 0; g.bx = g.x; g.by = g.y;
    if (!this.houses[g.target].lit) g.target = this.pickTarget(g.x, g.y);
  }

  private newChain(x: number, y: number): Chain {
    const c: Chain = { id: this.nextId++, count: 0, pts: 0, lx: x, ly: y };
    this.chains.set(c.id, c);
    return c;
  }

  /** 刻ごとの波。数体ずつの「群れ」を同じ方角から放つ(まとめて巻き込む好機になる) */
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
      speed: this.P.ghostSpeed * mult * (0.9 + this.rng.next() * 0.2),
      target: this.pickTarget(x, y), age: 0, phase: this.rng.next() * Math.PI * 2,
      lure: 0,
      hopT: 1.2 + this.rng.next() * 1.0, dashT: 0, crouch: 0, stun: 0, dead: false,
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

  /** おばけの今の行き先(呼ばれている灯り、なければ家) */
  goal(g: Ghost): [number, number] {
    if (g.lure > 0) { const l = this.lanterns.find((q) => q.id === g.lure); if (l) return [l.x, l.y]; }
    if (g.lure < 0) { const s = this.wisps.find((q) => -q.id === g.lure); if (s) return [s.x, s.y]; }
    const h = this.houses[g.target];
    return [h.x, h.y];
  }

  /** 跳ねる唐傘の着地点(溜めている間の予告に使う) */
  hopLanding(g: Ghost): [number, number] {
    const [hx, hy] = this.goal(g);
    const dx = hx - g.bx, dy = hy - g.by, d = Math.hypot(dx, dy) || 1;
    const jump = Math.min(d, this.P.hopDist);
    return [g.bx + (dx / d) * jump, g.by + (dy / d) * jump];
  }

  /** 灯りの寄せ範囲に入ったら、そちらへ向きを変える。光嫌いは提灯には寄らない */
  private tryLure(g: Ghost) {
    const P = this.P;
    let best = 0, bd = Infinity;
    if (g.kind !== 'kirai') {
      for (const l of this.lanterns) {
        if (l.flying) continue;
        const d = Math.hypot(l.x - g.x, l.y - g.y);
        if (d < P.lureR && d < bd) { bd = d; best = l.id; }
      }
    }
    for (const s of this.wisps) {
      if (s.age < 0.2) continue;
      const d = Math.hypot(s.x - g.x, s.y - g.y);
      if (d < P.wispLure && d < bd) { bd = d; best = -s.id; }
    }
    if (best !== 0) { g.lure = best; g.bx = g.x; g.by = g.y; }
  }

  private moveGhosts(dt: number) {
    const P = this.P;
    const ramp = 1 + P.speedRamp * this.wave;
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.age += dt;
      if (g.lure > 0 && !this.lanterns.some((l) => l.id === g.lure)) this.unlure(g);
      if (g.lure < 0 && !this.wisps.some((s) => -s.id === g.lure)) this.unlure(g);
      if (g.lure === 0 && !this.houses[g.target].lit) g.target = this.pickTarget(g.x, g.y);
      if (g.lure === 0) this.tryLure(g);
      if (g.stun > 0) { g.stun -= dt; g.crouch = 0; continue; }
      const sp = g.speed * ramp * (g.lure ? P.lureSpeed : 1);

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
          // 光を嫌う: 灯った提灯の「割れる輪」の外側を回り込む
          let px = 0, py = 0;
          for (const l of this.lanterns) {
            if (l.flying) continue;
            const lx = g.bx - l.x, ly = g.by - l.y, ld = Math.hypot(lx, ly) || 1;
            const edge = l.r + 30;
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

      // 提灯に触れたら、提灯は食われて消える(おばけはそのまま家へ)
      if (g.lure > 0) {
        const l = this.lanterns.find((q) => q.id === g.lure)!;
        if (Math.hypot(l.x - g.x, l.y - g.y) < EAT_R) {
          this.dropLantern(l);
          this.events.push({ type: 'eaten', x: l.x, y: l.y });
        }
        continue;
      }
      // 味方の灯りに触れたら、灯りが弾ける(おばけごと成仏)
      if (g.lure < 0) {
        const s = this.wisps.find((q) => -q.id === g.lure)!;
        if (Math.hypot(s.x - g.x, s.y - g.y) < EAT_R) this.popWisp(s);
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
        // 次の成仏の光(連鎖)と、味方の灯り
        added.push({ x: g.x, y: g.y, maxR: P.chainR, age: 0, dur: P.chainDur, delay: P.chainDelay, chain: chain.id, big: false, r: 0 });
        if (this.wisps.length < 40) {
          const a = this.rng.next() * Math.PI * 2;
          this.wisps.push({ id: this.nextId++, x: g.x, y: g.y, age: 0, chain: chain.id, vx: Math.cos(a) * 25, vy: Math.sin(a) * 25 - 20 });
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
