// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
import { Rng } from '../core/rng';
import type { Params } from './params';

export const W = 960;
export const H = 540;
/** 巻物の紙の内側(遊べる範囲) */
export const FIELD = { x0: 70, y0: 46, x1: 890, y1: 494 };
export const DT = 1 / 60;

/** 家の位置。巻物の中ほどに、うねる道に沿って点在させる(下一列に並べない) */
export const HOUSE_POS: ReadonlyArray<[number, number]> = [
  [205, 246], [318, 318], [440, 228], [548, 300], [668, 238], [770, 322],
];

export type GhostKind = 'fuwa' | 'zig' | 'hop' | 'kirai';

export interface Ghost {
  id: number; kind: GhostKind;
  x: number; y: number;
  /** 見た目の向き(-1 左 / 1 右) */
  face: number;
  speed: number; target: number; age: number; phase: number;
  /** 寄せられている灯りの id(提灯は正、味方の灯りは負)。0 = 自由 */
  held: number;
  orbitA: number; orbitR: number;
  zigT: number; zigSign: number;
  hopT: number; dashT: number;
  /** ジャンプ直前の溜め(見た目用) */
  crouch: number;
  dead: boolean;
}
export interface Lantern { id: number; x: number; y: number; age: number; held: number }
export interface Wisp { id: number; x: number; y: number; age: number; chain: number; vx: number; vy: number }
export interface House { x: number; y: number; lit: boolean; flash: number }
export interface Wave { x: number; y: number; r: number; maxR: number; delay: number; chain: number; big: boolean }
export interface Chain { id: number; count: number; pts: number; lx: number; ly: number }

export type GameEvent =
  | { type: 'place'; x: number; y: number }
  | { type: 'deny'; x: number; y: number }
  | { type: 'break'; x: number; y: number; held: number; r: number }
  | { type: 'burnout'; x: number; y: number }
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
  waves: Wave[] = [];
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

  /** 1 タップ。提灯の近くなら割る、そうでなければ置く */
  tap(x: number, y: number) {
    if (this.over) return;
    x = Math.round(x); y = Math.round(y); // 記録(整数)と同じ値で動かす
    let best: Lantern | null = null, bd = this.P.tapR;
    for (const l of this.lanterns) {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d <= bd) { bd = d; best = l; }
    }
    if (best) { this.breakLantern(best); return; }
    x = clamp(x, FIELD.x0 + 8, FIELD.x1 - 8);
    y = clamp(y, FIELD.y0 + 8, FIELD.y1 - 8);
    if (this.lanterns.length >= this.P.maxLanterns) { this.events.push({ type: 'deny', x, y }); return; }
    this.lanterns.push({ id: this.nextId++, x, y, age: 0, held: 0 });
    this.events.push({ type: 'place', x, y });
  }

  private breakLantern(l: Lantern) {
    const held = this.ghosts.filter((g) => g.held === l.id && !g.dead).length;
    const chain = this.newChain(l.x, l.y);
    const r = this.P.burstR + this.P.burstPer * held;
    this.addWave(l.x, l.y, r, 0, chain, true);
    this.lanterns = this.lanterns.filter((q) => q !== l);
    for (const g of this.ghosts) if (g.held === l.id) g.held = 0;
    this.events.push({ type: 'break', x: l.x, y: l.y, held, r });
  }

  private addWave(x: number, y: number, maxR: number, delay: number, chain: Chain, big = false) {
    if (maxR <= 0) return;
    this.waves.push({ x, y, r: 0, maxR, delay, chain: chain.id, big });
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

    // 提灯: 燃え尽きたら寄せていたおばけを放す
    for (const l of this.lanterns) {
      l.age += dt;
      if (l.age >= P.lanternLife) {
        for (const g of this.ghosts) if (g.held === l.id) g.held = 0;
        this.events.push({ type: 'burnout', x: l.x, y: l.y });
      }
    }
    this.lanterns = this.lanterns.filter((l) => l.age < P.lanternLife);
    for (const l of this.lanterns) l.held = 0;

    // 味方の灯り: ふわりと昇り、時間が来たら弾けて周りを成仏させる
    for (const s of this.wisps) {
      s.age += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.97; s.vy *= 0.97;
      if (s.age >= P.wispLife) {
        const c = this.chains.get(s.chain) ?? this.newChain(s.x, s.y);
        this.addWave(s.x, s.y, P.wispPop, 0, c);
        for (const g of this.ghosts) if (g.held === -s.id) g.held = 0;
        this.events.push({ type: 'wispPop', x: s.x, y: s.y });
      }
    }
    this.wisps = this.wisps.filter((s) => s.age < P.wispLife);

    this.moveGhosts(dt);
    this.runWaves(dt);
    this.closeChains();

    for (const h of this.houses) h.flash = Math.max(0, h.flash - dt);

    // 寿命切れ・成仏を一度に掃除
    let n = 0;
    for (const g of this.ghosts) if (!g.dead) this.ghosts[n++] = g;
    this.ghosts.length = n;

    if (this.litCount === 0) { this.over = true; this.events.push({ type: 'over' }); }
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
        const gx = clamp(ex + (this.rng.next() - 0.5) * 50, FIELD.x0, FIELD.x1);
        const gy = clamp(ey + (this.rng.next() - 0.5) * 50, FIELD.y0, FIELD.y1);
        this.addGhost(group > 1 && i > 0 ? 'fuwa' : kind, gx, gy);
      }
      this.spawnAcc -= (group - 1) * 0.5;
    }
  }

  /** 巻物の四辺のどこか。家から遠すぎず近すぎず */
  private edgePoint(): [number, number] {
    const side = this.rng.int(0, 3);
    const r = this.rng.next();
    if (side === 0) return [lerp(FIELD.x0, FIELD.x1, r), FIELD.y0];
    if (side === 1) return [lerp(FIELD.x0, FIELD.x1, r), FIELD.y1];
    if (side === 2) return [FIELD.x0, lerp(FIELD.y0, FIELD.y1, r)];
    return [FIELD.x1, lerp(FIELD.y0, FIELD.y1, r)];
  }

  addGhost(kind: GhostKind, x: number, y: number) {
    const mult = { fuwa: 1, zig: 1.25, hop: 0.55, kirai: 0.95 }[kind];
    const g: Ghost = {
      id: this.nextId++, kind, x, y, face: 1,
      speed: this.P.ghostSpeed * mult * (0.85 + this.rng.next() * 0.3),
      target: this.pickTarget(x, y), age: 0, phase: this.rng.next() * Math.PI * 2,
      held: 0, orbitA: 0, orbitR: 0,
      zigT: 0, zigSign: this.rng.chance(0.5) ? 1 : -1,
      hopT: 1 + this.rng.next() * 1.2, dashT: 0, crouch: 0, dead: false,
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

  private moveGhosts(dt: number) {
    const P = this.P;
    const ramp = 1 + P.speedRamp * (this.t / 60);
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.age += dt;
      if (!this.houses[g.target].lit) g.target = this.pickTarget(g.x, g.y);
      const sp = g.speed * ramp;

      // 寄せられていない(または外れた)なら、近くの灯りを探す
      if (g.held > 0 && !this.lanterns.some((l) => l.id === g.held)) g.held = 0;
      if (g.held < 0 && !this.wisps.some((s) => -s.id === g.held)) g.held = 0;
      if (g.held === 0) this.tryCapture(g);

      if (g.held !== 0) {
        const c = g.held > 0 ? this.lanterns.find((l) => l.id === g.held)! : this.wisps.find((s) => -s.id === g.held)!;
        if (g.held > 0) (c as Lantern).held++;
        g.orbitA += dt * (1.6 + (g.id % 5) * 0.12) * (g.id % 2 ? 1 : -1);
        const tx = c.x + Math.cos(g.orbitA) * g.orbitR;
        const ty = c.y + Math.sin(g.orbitA) * g.orbitR * 0.8;
        const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
        const v = Math.max(sp * 2.2, 60);
        if (d > 0.01) {
          const m = Math.min(d, v * dt) / d;
          g.x += dx * m; g.y += dy * m;
          if (Math.abs(dx) > 0.5) g.face = dx < 0 ? -1 : 1;
        }
        g.crouch = 0; g.dashT = 0;
        continue;
      }

      const h = this.houses[g.target];
      let dx = h.x - g.x, dy = h.y - g.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;
      let vx = 0, vy = 0;
      switch (g.kind) {
        case 'fuwa': {
          // ふらふら漂う: 横揺れが大きい
          const wob = Math.sin(g.age * 1.7 + g.phase) * 0.9;
          vx = (dx - dy * wob) * sp; vy = (dy + dx * wob) * sp;
          break;
        }
        case 'zig': {
          // ジグザグ: 一定間隔で進む向きを左右に振る
          g.zigT += dt;
          if (g.zigT > 0.7) { g.zigT = 0; g.zigSign *= -1; }
          const a = 0.95 * g.zigSign;
          const c = Math.cos(a), s = Math.sin(a);
          vx = (dx * c - dy * s) * sp; vy = (dx * s + dy * c) * sp;
          break;
        }
        case 'hop': {
          // 急に跳ぶ: ゆっくり進み、ときどき溜めてから一気に跳ぶ
          if (g.dashT > 0) {
            g.dashT -= dt;
            vx = dx * sp * 9; vy = dy * sp * 9;
          } else {
            g.hopT -= dt;
            g.crouch = clamp(1 - g.hopT / 0.5, 0, 1);
            if (g.hopT <= 0) { g.dashT = 0.22; g.hopT = 1.6 + this.rng.next() * 1.4; g.crouch = 0; }
            vx = dx * sp * 0.6; vy = dy * sp * 0.6;
          }
          break;
        }
        case 'kirai': {
          // 光を嫌う: 提灯の明かりの縁を回り込む
          vx = dx; vy = dy;
          for (const l of this.lanterns) {
            const lx = g.x - l.x, ly = g.y - l.y, ld = Math.hypot(lx, ly) || 1;
            const edge = P.attractR * 1.05;
            if (ld < edge + 30) {
              const push = clamp((edge + 30 - ld) / 30, 0, 3);
              const tx = -ly / ld, ty = lx / ld; // 接線
              const side = tx * dx + ty * dy >= 0 ? 1 : -1;
              vx += (lx / ld) * push * 1.4 + tx * side * push;
              vy += (ly / ld) * push * 1.4 + ty * side * push;
            }
          }
          const n = Math.hypot(vx, vy) || 1;
          vx = (vx / n) * sp; vy = (vy / n) * sp;
          break;
        }
      }
      g.x += vx * dt; g.y += vy * dt;
      g.x = clamp(g.x, FIELD.x0 - 10, FIELD.x1 + 10);
      g.y = clamp(g.y, FIELD.y0 - 10, FIELD.y1 + 10);
      if (Math.abs(vx) > 1) g.face = vx < 0 ? -1 : 1;

      if (Math.hypot(h.x - g.x, h.y - g.y) < 16 && h.lit) {
        h.lit = false; h.flash = 0.6; g.dead = true;
        this.events.push({ type: 'houseOut', x: h.x, y: h.y, left: this.litCount });
      }
    }
  }

  private tryCapture(g: Ghost) {
    const P = this.P;
    let best = 0, bd = Infinity;
    if (g.kind !== 'kirai') {
      for (const l of this.lanterns) {
        if (l.age < 0.25) continue; // 灯がともるまで
        const d = Math.hypot(l.x - g.x, l.y - g.y);
        if (d < P.attractR && d < bd) { bd = d; best = l.id; }
      }
    }
    // 成仏した仲間の灯りには、光嫌いも寄ってくる
    for (const s of this.wisps) {
      if (s.age < 0.3) continue;
      const d = Math.hypot(s.x - g.x, s.y - g.y);
      if (d < P.wispAttract && d < bd) { bd = d; best = -s.id; }
    }
    if (best !== 0) {
      g.held = best;
      const c = best > 0 ? this.lanterns.find((l) => l.id === best)! : this.wisps.find((s) => -s.id === best)!;
      g.orbitA = Math.atan2(g.y - c.y, g.x - c.x);
      g.orbitR = (best > 0 ? P.orbitR : P.orbitR * 0.6) * (0.7 + this.rng.next() * 0.6);
    }
  }

  private runWaves(dt: number) {
    const P = this.P;
    const added: Wave[] = [];
    for (const wv of this.waves) {
      if (wv.delay > 0) { wv.delay -= dt; continue; }
      wv.r = Math.min(wv.maxR, wv.r + wv.maxR * dt / 0.18);
      const chain = this.chains.get(wv.chain)!;
      for (const g of this.ghosts) {
        if (g.dead) continue;
        if (Math.hypot(g.x - wv.x, g.y - wv.y) > wv.r + 8) continue;
        g.dead = true;
        chain.count++;
        const pts = P.basePts * chain.count;
        chain.pts += pts; this.score += pts; this.purified++;
        chain.lx = g.x; chain.ly = g.y;
        this.events.push({ type: 'purify', x: g.x, y: g.y, n: chain.count, pts, kind: g.kind });
        // 次の波(連鎖)と、味方の灯り
        added.push({ x: g.x, y: g.y, r: 0, maxR: P.chainR, delay: P.chainDelay, chain: chain.id, big: false });
        if (this.wisps.length < 60) {
          const a = this.rng.next() * Math.PI * 2;
          this.wisps.push({ id: this.nextId++, x: g.x, y: g.y, age: 0, chain: chain.id, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20 });
        }
      }
    }
    // 広がりきった波を閉じる
    this.waves = this.waves.filter((wv) => !(wv.delay <= 0 && wv.r >= wv.maxR)).concat(added);
  }

  /** 波も灯りも残っていない連鎖を締め、大連鎖なら家の灯りを戻す */
  private closeChains() {
    const alive = new Map<number, number>();
    for (const s of this.wisps) alive.set(s.chain, (alive.get(s.chain) ?? 0) + 1);
    for (const wv of this.waves) alive.set(wv.chain, (alive.get(wv.chain) ?? 0) + 1);
    for (const c of [...this.chains.values()]) {
      if (alive.get(c.id)) continue;
      this.chains.delete(c.id);
      if (c.count === 0) continue;
      this.bestChain = Math.max(this.bestChain, c.count);
      const last: [number, number] = [c.lx, c.ly];
      this.events.push({ type: 'chainEnd', x: last[0], y: last[1], n: c.count, pts: c.pts });
      let relights = Math.floor(c.count / this.P.relightAt);
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
