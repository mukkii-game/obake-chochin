// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// 設計の芯(ミサイルコマンドの「直感・予測・選択」を移す。サインは足さない):
//   ルールは 1 つ「おばけは灯りに寄る」。家の灯りに寄って来るし、もっと明るい提灯があればそちらへ曲がる。
//   - 予測: おばけは「あの世の口」(毎刻、場所が変わる。刻の前から見えている)から出て、一番近い灯りへまっすぐ来る。
//           種類の違いは道の形ではなく速さの癖(止まっては跳ぶ、折れ線で来る、灯りを避ける)。通った跡が残る。
//   - 直感: タップした所へ家から提灯が飛ぶ。着くと灯り、近くのおばけを呼び寄せ、いつも同じ間をおいて弾ける。
//           弾ける光の大きさと長さもいつも同じ。提灯を押せばその場で(飛行中なら着いた所で)弾ける。
//   - 選択: 提灯は家の軒先に下がっている分だけ(1 軒 3 つ、刻ごとに補充)。家が消えると、その家の提灯も消える。
//           おばけが家に入ると、家の人が騒いでしばらく灯りが揺れ、やがて逃げ出して灯りが消える。
//           揺れている間にそのおばけを成仏させれば家は助かる。助けに行くか、群れを狙うか。
//   - 家の並びは毎回変わる(seed で決まる)。
import { Rng } from '../core/rng';
import type { Params } from './params';

export const W = 960;
export const H = 540;
/** 巻物の紙の内側(遊べる範囲) */
export const FIELD = { x0: 70, y0: 46, x1: 890, y1: 494 };
export const DT = 1 / 60;
/** おばけの当たりの半径 */
export const GHOST_R = 10;
export const HOUSE_COUNT = 6;

export type GhostKind = 'fuwa' | 'zig' | 'hop' | 'kirai';

export interface Ghost {
  id: number; kind: GhostKind;
  /** 当たり判定と表示の位置 */
  x: number; y: number;
  /** 進路の芯。ふらふらの揺れは芯からの小さな横ずれ */
  bx: number; by: number;
  face: number;
  speed: number; target: number; age: number; phase: number;
  /** 呼び寄せている提灯の id。0 = 家の灯りへ向かう */
  lure: number;
  /** 家に入り込んでいる(家の人が騒いでいる) */
  haunt: boolean;
  /** 唐傘: 次に跳ぶまで / 跳んでいる残り */
  hopT: number; dashT: number;
  /** 跳ぶ前の溜め 0..1(見た目用) */
  crouch: number;
  /** 鬼火: 折れ線の今の向き(±1)と、折れるまでの残り */
  legSign: number; legT: number;
  dead: boolean;
}
export interface Lantern {
  id: number;
  /** 飛び立った家の位置と、行き先 */
  sx: number; sy: number; tx: number; ty: number;
  x: number; y: number;
  flying: boolean; flyT: number; flyDur: number;
  /** 飛んでいる最中に押された = 着いたらすぐ弾ける */
  armed: boolean;
  /** 灯ってから弾けるまでの残り秒(いつも同じ長さで始まる) */
  fuse: number;
}
export interface Wisp { id: number; x: number; y: number; age: number; chain: number; vx: number; vy: number }
export interface House {
  x: number; y: number; lit: boolean;
  /** 軒先に下がっている提灯の数 */
  ammo: number;
  /** おばけが入り込んでからの残り秒(0 = 平穏) */
  haunt: number;
  flash: number;
}
/** あの世の口(おばけの出てくる所)。刻ごとに場所が変わり、刻の前から見えている */
export interface Portal { x: number; y: number }
/** 成仏の光。広がって、少し留まり、縮む(ミサイルコマンドの爆発と同じ形) */
export interface Blast { x: number; y: number; maxR: number; age: number; dur: number; delay: number; chain: number; big: boolean; r: number }
export interface Chain { id: number; count: number; pts: number; lx: number; ly: number }

export type GameEvent =
  | { type: 'launch'; sx: number; sy: number; x: number; y: number; house: number }
  | { type: 'arm'; x: number; y: number }
  | { type: 'light'; x: number; y: number }
  | { type: 'deny'; x: number; y: number }
  | { type: 'break'; x: number; y: number }
  | { type: 'purify'; x: number; y: number; n: number; pts: number; kind: GhostKind }
  | { type: 'wispPop'; x: number; y: number }
  | { type: 'chainEnd'; x: number; y: number; n: number; pts: number }
  | { type: 'haunt'; x: number; y: number; house: number }
  | { type: 'saved'; x: number; y: number; house: number }
  | { type: 'houseOut'; x: number; y: number; house: number; left: number }
  | { type: 'relight'; x: number; y: number; from: [number, number] }
  | { type: 'spawn'; x: number; y: number; kind: GhostKind }
  | { type: 'portals' }
  | { type: 'watch'; n: number }
  | { type: 'waveEnd'; n: number; bonus: number }
  | { type: 'over' };

/** 刻の前の一息(この間に、次のあの世の口が見えている) */
export const WAVE_PAUSE = 3.0;

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
  saved = 0;
  over = false;
  ghosts: Ghost[] = [];
  lanterns: Lantern[] = [];
  wisps: Wisp[] = [];
  blasts: Blast[] = [];
  chains = new Map<number, Chain>();
  houses: House[];
  portals: Portal[] = [];
  events: GameEvent[] = [];
  /** 今の刻(0 始まり) */
  wave = 0;
  /** この刻でまだ出ていないおばけの数 */
  waveLeft = 0;
  /** 刻の前の一息の残り秒(0 なら刻の最中) */
  pause = WAVE_PAUSE;
  private nextId = 1;
  private salvoT = 0;
  private portalTurn = 0;
  private begun = false;

  constructor(seed: number, readonly P: Params) {
    this.rng = new Rng(seed);
    this.houses = this.layVillage();
    this.choosePortals(0);
    this.waveLeft = this.waveSize(0);
    for (const h of this.houses) h.ammo = P.ammoPerHouse;
  }

  /** 村の家並み。毎回変わる(巻物の中ほどの帯に、間をあけて点在) */
  private layVillage(): House[] {
    const out: House[] = [];
    for (let tries = 0; out.length < HOUSE_COUNT && tries < 2000; tries++) {
      const x = lerp(170, 790, this.rng.next()), y = lerp(205, 345, this.rng.next());
      if (out.every((h) => Math.hypot(h.x - x, (h.y - y) * 1.3) > 105)) out.push({ x, y, lit: true, ammo: 0, haunt: 0, flash: 0 });
    }
    out.sort((a, b) => a.x - b.x);
    return out.map((h) => ({ ...h, x: Math.round(h.x), y: Math.round(h.y) }));
  }

  waveSize(n: number) { return Math.round(this.P.waveBase + this.P.waveGrow * n); }

  /** 刻ごとのあの世の口。巻物の縁のどこか。刻が進むと口が増える */
  private choosePortals(n: number) {
    const count = Math.min(3, 1 + Math.floor(n / this.P.portalEvery));
    const ps: Portal[] = [];
    for (let tries = 0; ps.length < count && tries < 200; tries++) {
      const [x, y] = this.edgePoint();
      if (ps.every((p) => Math.hypot(p.x - x, p.y - y) > 260)) ps.push({ x: Math.round(x), y: Math.round(y) });
    }
    this.portals = ps;
    this.portalTurn = 0;
    this.events.push({ type: 'portals' });
  }

  get litCount() { return this.houses.filter((h) => h.lit).length; }

  /** 一番近い、灯りのついた家 */
  nearestLit(x: number, y: number): number {
    let best = -1, bd = Infinity;
    this.houses.forEach((h, i) => {
      if (!h.lit) return;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** 行き先に一番近い、提灯の残っている家 */
  launchHouse(x: number, y: number): number {
    let best = -1, bd = Infinity;
    this.houses.forEach((h, i) => {
      if (!h.lit || h.ammo <= 0) return;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** 提灯が着くまでの秒(bot の先読み用にも公開) */
  flightTime(x: number, y: number): number {
    const i = this.launchHouse(x, y);
    if (i < 0) return Infinity;
    const h = this.houses[i];
    return Math.hypot(x - h.x, y - (h.y - 18)) / this.P.flySpeed;
  }

  get ammo() { return this.houses.reduce((s, h) => s + (h.lit ? h.ammo : 0), 0); }

  /** 1 タップ。提灯(か飛んでいる提灯の行き先)の近く → 弾けさせる / それ以外 → 飛ばす */
  tap(x: number, y: number) {
    if (this.over) return;
    x = Math.round(x); y = Math.round(y); // 記録(整数)と同じ値で動かす
    const P = this.P;
    let best: Lantern | null = null, bd = P.tapR;
    for (const l of this.lanterns) {
      const d = Math.min(Math.hypot(l.x - x, l.y - y), l.flying ? Math.hypot(l.tx - x, l.ty - y) : Infinity);
      if (d <= bd) { bd = d; best = l; }
    }
    if (best) {
      if (!best.flying) this.burst(best);
      else if (!best.armed) { best.armed = true; this.events.push({ type: 'arm', x: best.tx, y: best.ty }); }
      return;
    }
    x = clamp(x, FIELD.x0 + 8, FIELD.x1 - 8);
    y = clamp(y, FIELD.y0 + 8, FIELD.y1 - 8);
    const hi = this.launchHouse(x, y);
    if (hi < 0 || this.lanterns.length >= P.maxLanterns) { this.events.push({ type: 'deny', x, y }); return; }
    const h = this.houses[hi];
    h.ammo--;
    const sy = h.y - 18;
    const flyDur = Math.max(0.08, Math.hypot(x - h.x, y - sy) / P.flySpeed);
    this.lanterns.push({ id: this.nextId++, sx: h.x, sy, tx: x, ty: y, x: h.x, y: sy, flying: true, flyT: 0, flyDur, armed: false, fuse: 0 });
    this.events.push({ type: 'launch', sx: h.x, sy, x, y, house: hi });
  }

  private burst(l: Lantern) {
    const chain = this.newChain(l.x, l.y);
    this.addBlast(l.x, l.y, this.P.blastR, this.P.blastDur, 0, chain, true);
    this.lanterns = this.lanterns.filter((q) => q !== l);
    for (const g of this.ghosts) if (g.lure === l.id) this.release(g);
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

    // 提灯: 飛ぶ → 灯る(呼び寄せる) → いつも同じ間で弾ける
    for (const l of [...this.lanterns]) {
      if (l.flying) {
        l.flyT += dt;
        const k = Math.min(1, l.flyT / l.flyDur);
        l.x = lerp(l.sx, l.tx, k); l.y = lerp(l.sy, l.ty, k);
        if (k >= 1) {
          l.flying = false; l.x = l.tx; l.y = l.ty;
          if (l.armed) { this.burst(l); continue; }
          l.fuse = P.fuse;
          this.events.push({ type: 'light', x: l.x, y: l.y });
        }
        continue;
      }
      l.fuse -= dt;
      if (l.fuse <= 0) this.burst(l);
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
    this.runHaunts(dt);

    for (const h of this.houses) h.flash = Math.max(0, h.flash - dt);

    let n = 0;
    for (const g of this.ghosts) if (!g.dead) this.ghosts[n++] = g;
    this.ghosts.length = n;

    if (this.litCount === 0) { this.over = true; this.events.push({ type: 'over' }); }
  }

  /** 家に入り込んだおばけ: 間に成仏させれば家は助かる。間に合わなければ家の人が逃げ出して灯りが消える */
  private runHaunts(dt: number) {
    this.houses.forEach((h, i) => {
      if (h.haunt <= 0) return;
      const inside = this.ghosts.filter((g) => !g.dead && g.haunt && g.target === i);
      if (!inside.length) {
        h.haunt = 0; this.saved++;
        this.events.push({ type: 'saved', x: h.x, y: h.y, house: i });
        return;
      }
      h.haunt -= dt;
      if (h.haunt > 0) return;
      h.haunt = 0; h.lit = false; h.ammo = 0; h.flash = 0.6;
      for (const g of inside) g.dead = true;
      this.events.push({ type: 'houseOut', x: h.x, y: h.y, house: i, left: this.litCount });
    });
  }

  private release(g: Ghost) {
    g.lure = 0; g.bx = g.x; g.by = g.y;
    const t = this.nearestLit(g.x, g.y);
    if (t >= 0) g.target = t;
  }

  private newChain(x: number, y: number): Chain {
    const c: Chain = { id: this.nextId++, count: 0, pts: 0, lx: x, ly: y };
    this.chains.set(c.id, c);
    return c;
  }

  /** 刻ごとの波。あの世の口から、数体ずつの群れを放つ */
  private spawn(dt: number) {
    const P = this.P;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        if (this.begun) {
          this.wave++; this.waveLeft = this.waveSize(this.wave);
          for (const h of this.houses) if (h.lit) h.ammo = P.ammoPerHouse;
        }
        this.begun = true;
        this.salvoT = 0;
        this.events.push({ type: 'watch', n: this.wave });
      }
      return;
    }
    if (this.waveLeft <= 0) {
      if (this.ghosts.length === 0 && this.lanterns.length === 0 && this.houses.every((h) => h.haunt <= 0)) {
        const bonus = (this.litCount * P.waveBonus + this.ammo * P.ammoBonus) * (this.wave + 1);
        this.score += bonus;
        this.pause = WAVE_PAUSE;
        this.events.push({ type: 'waveEnd', n: this.wave, bonus });
        this.choosePortals(this.wave + 1);
      }
      return;
    }
    this.salvoT -= dt;
    if (this.salvoT > 0) return;
    const n = this.wave;
    this.salvoT = Math.max(P.salvoGapMin, P.salvoGap - 0.2 * n) * (0.85 + this.rng.next() * 0.3);
    const kinds: GhostKind[] = ['fuwa'];
    if (n >= 1) kinds.push('hop');
    if (n >= 2) kinds.push('zig');
    if (n >= 3) kinds.push('kirai');
    const kind = this.rng.chance(0.35) ? 'fuwa' : this.rng.pick(kinds);
    const size = Math.min(this.waveLeft, this.rng.int(2, Math.min(5, 2 + Math.floor(n / 2))));
    const p = this.portals[this.portalTurn++ % this.portals.length];
    for (let i = 0; i < size; i++) {
      const gx = clamp(p.x + (this.rng.next() - 0.5) * 50, FIELD.x0, FIELD.x1);
      const gy = clamp(p.y + (this.rng.next() - 0.5) * 50, FIELD.y0, FIELD.y1);
      this.addGhost(kind === 'kirai' && i > 0 ? 'fuwa' : kind, gx, gy);
    }
    this.waveLeft -= size;
  }

  /** 巻物の四辺のどこか(家から十分に遠い所) */
  private edgePoint(): [number, number] {
    const side = this.rng.int(0, 3);
    const r = lerp(0.08, 0.92, this.rng.next());
    if (side === 0) return [lerp(FIELD.x0, FIELD.x1, r), FIELD.y0 + 22];
    if (side === 1) return [lerp(FIELD.x0, FIELD.x1, r), FIELD.y1 - 24];
    if (side === 2) return [FIELD.x0 + 22, lerp(FIELD.y0, FIELD.y1, r)];
    return [FIELD.x1 - 22, lerp(FIELD.y0, FIELD.y1, r)];
  }

  addGhost(kind: GhostKind, x: number, y: number) {
    const mult = { fuwa: 1, zig: 1.25, hop: 0.9, kirai: 0.85 }[kind];
    const g: Ghost = {
      id: this.nextId++, kind, x, y, bx: x, by: y, face: 1,
      speed: this.P.ghostSpeed * mult,
      target: Math.max(0, this.nearestLit(x, y)), age: 0, phase: this.rng.next() * Math.PI * 2,
      lure: 0, haunt: false,
      hopT: 1.0, dashT: 0, crouch: 0,
      legSign: this.rng.chance(0.5) ? 1 : -1, legT: this.P.zigLeg * 0.5,
      dead: false,
    };
    this.ghosts.push(g);
    this.events.push({ type: 'spawn', x, y, kind });
    return g;
  }

  /** おばけの今の行き先(呼び寄せている提灯、なければ家) */
  goal(g: Ghost): [number, number] {
    if (g.lure) { const l = this.lanterns.find((q) => q.id === g.lure); if (l) return [l.x, l.y]; }
    const h = this.houses[g.target];
    return [h.x, h.y];
  }

  /** 灯った提灯の近くを通ると、そちらへ曲がる(光嫌いは寄らない) */
  private tryLure(g: Ghost) {
    if (g.kind === 'kirai') return;
    let best = 0, bd = this.P.lureR;
    for (const l of this.lanterns) {
      if (l.flying) continue;
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
      if (g.haunt) continue; // 家の中で騒ぎを起こしている
      if (g.lure && !this.lanterns.some((l) => l.id === g.lure)) this.release(g);
      if (!g.lure && !this.houses[g.target].lit) {
        const t = this.nearestLit(g.x, g.y);
        if (t >= 0) g.target = t;
      }
      if (!g.lure) this.tryLure(g);
      const sp = g.speed * ramp;

      const [hx, hy] = this.goal(g);
      let dx = hx - g.bx, dy = hy - g.by;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;
      let vx = dx, vy = dy, bsp = sp, off = 0;
      switch (g.kind) {
        case 'fuwa':
          // ふらふら: まっすぐ来るが、ゆっくり小さく揺れる
          off = Math.sin(g.age * 2 + g.phase) * 7 * clamp(dist / 60, 0, 1);
          break;
        case 'zig': {
          // 鬼火: 一定の間で折れる折れ線。行き先の近くではまっすぐ
          g.legT -= dt;
          if (g.legT <= 0) { g.legT = P.zigLeg; g.legSign *= -1; }
          if (dist > 70 && !g.lure) {
            const a = 0.6 * g.legSign, c = Math.cos(a), s = Math.sin(a);
            vx = dx * c - dy * s; vy = dx * s + dy * c;
          }
          break;
        }
        case 'hop':
          // 唐傘: 止まって溜めては、同じ距離だけ跳ぶ
          if (g.dashT > 0) {
            g.dashT -= dt;
            bsp = P.hopDist / 0.22;
          } else {
            g.hopT -= dt;
            g.crouch = clamp(1 - g.hopT / 0.5, 0, 1);
            bsp = 0;
            if (g.hopT <= 0) { g.dashT = 0.22; g.hopT = P.hopDist / sp - 0.22; g.crouch = 0; }
          }
          break;
        case 'kirai': {
          // 光嫌い: 灯った提灯を避けて回り込む
          for (const l of this.lanterns) {
            if (l.flying) continue;
            const lx = g.bx - l.x, ly = g.by - l.y, ld = Math.hypot(lx, ly) || 1;
            if (ld < P.repelR) {
              const push = (P.repelR - ld) / 25;
              const tx = -ly / ld, ty = lx / ld;
              const side = tx * dx + ty * dy >= 0 ? 1 : -1;
              vx += (lx / ld) * push * 1.4 + tx * side * push;
              vy += (ly / ld) * push * 1.4 + ty * side * push;
            }
          }
          const n = Math.hypot(vx, vy) || 1;
          vx /= n; vy /= n;
          break;
        }
      }
      const stp = Math.min(dist, bsp * dt);
      g.bx += vx * stp; g.by += vy * stp;
      g.bx = clamp(g.bx, FIELD.x0 - 10, FIELD.x1 + 10);
      g.by = clamp(g.by, FIELD.y0 - 10, FIELD.y1 + 10);
      const nx = g.bx - dy * off, ny = g.by + dx * off;
      if (Math.abs(nx - g.x) > 0.3) g.face = nx < g.x ? -1 : 1;
      g.x = nx; g.y = ny;

      if (g.lure) continue; // 提灯のそばで待つ(弾ければ成仏)
      const h = this.houses[g.target];
      if (h.lit && Math.hypot(h.x - g.x, h.y - g.y) < 14) {
        g.haunt = true; g.x = h.x; g.y = h.y; g.bx = h.x; g.by = h.y;
        if (h.haunt <= 0) {
          h.haunt = P.hauntTime;
          this.events.push({ type: 'haunt', x: h.x, y: h.y, house: g.target });
        }
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
      dark[0].lit = true; dark[0].flash = 0.8; dark[0].ammo = 1;
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
