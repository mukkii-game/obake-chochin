// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// 芯はミサイルコマンド(時限。位置はアナログ。サインは足さない。見て頭で読む):
//   - 投げる: 押した所へ、家から提灯がゆっくり飛び、着いた所で弾ける(着くまでの時間を読む)。
//     光は家の形どおり(縦の楼 = 縦 / 長屋 = 横)に、短く伸びる(最初はポーンより少し先まで)。
//     光に触れたおばけは成仏。光が届いた提灯も弾ける(誘爆。並べてつなげば飛車・角のように遠くまで)。
//   - その上に、プレイヤーが時を操る余地(平安京エイリアン・ディグダグ):
//     飛んでいる提灯をもう一度押すと、着いても弾けずに下がる。下がった提灯にたどり着いたおばけは見とれて止まり、
//     後ろのおばけはつかえて詰まる(せき止め)。下がった提灯は決まった時間で弾ける(押せばすぐ)。
//   - おばけどうしは連鎖しない。おばけは上の外から、決まった動き(まっすぐ / ジグザグ / 曲線)で家へ来る。
//   - 弾は軒先の提灯。時間で少しずつ戻る。
// マス目は描画の目安だけ。おばけ・家・提灯・光の位置はすべて px(アナログ)。
import { Rng } from '../core/rng';
import type { Params } from './params';
import { waveGroups, type Group } from './waves';

export const W = 960;
export const H = 540;
/** 巻物の紙の内側(遊べる範囲) */
export const FIELD = { x0: 70, y0: 46, x1: 890, y1: 494 };
export const DT = 1 / 60;
/** 遊べる範囲(おばけが動き、提灯を投げられる所) */
export const PLAY = { x0: 77, y0: 53, x1: 883, y1: 487 };
/** 目安のマス目(描画だけ) */
export const GUIDE = 31;
/** 出方の表(waves.ts)の「列」0-12 → x */
export const colX = (c: number) => PLAY.x0 + (c + 0.5) * ((PLAY.x1 - PLAY.x0) / 13);

/** 家並み(一番下。少しずつずれて建つ) */
export const HOUSE_POS: ReadonlyArray<[number, number]> = [[142, 452], [268, 462], [404, 448], [552, 460], [688, 450], [816, 460]];
/** 家を押したとみなす近さ / おばけが家に入ったとみなす近さ */
export const HOUSE_R = 26;
const HOME_R = 12;
/** おばけの体の大きさ(光に触れたかの判定) */
export const GHOST_R = 11;

/** おばけの動き: まっすぐ / ジグザグ / 曲線 */
export type GhostKind = 'fuwa' | 'kasa' | 'oni';

/** 提灯の模様 = 光の形。家の形とも対応する */
export type Piece = 'vline' | 'hline' | 'area' | 'up' | 'down' | 'cross';
export const PIECE_SETS: Record<string, Piece[]> = {
  '縦・横': ['vline', 'hline'],
  '縦・横・周り': ['vline', 'hline', 'area'],
  '上・下・周り': ['up', 'down', 'area'],
};

export interface Ghost {
  id: number; kind: GhostKind;
  x: number; y: number;
  /** 進む向き(単位ベクトル)。曲線はこれが少しずつ家の方へ曲がる */
  hx: number; hy: number;
  /** ジグザグ: 向き(±1)と、次に折れるまでの残り px */
  zig: number; zigLeft: number;
  speed: number; target: number; age: number; face: number;
  /** 止まっている(下がった提灯に見とれている / 前がつかえている) */
  stopped: boolean;
  /** 下がった提灯で見とれている */
  caught: boolean;
  /** 家に入り込んでいる(家の人が騒いでいる) */
  haunt: boolean;
  dead: boolean;
}
export interface Lantern {
  id: number;
  piece: Piece;
  /** 行き先(押した所) */
  tx: number; ty: number;
  sx: number; sy: number;
  x: number; y: number;
  flying: boolean; flyT: number; flyDur: number;
  /** 飛んでいる最中にもう一度押された = 着いても弾けずに下がる */
  hang: boolean;
  /** 下がってからの秒 */
  age: number;
}
export interface House { x: number; y: number; lit: boolean; ammo: number; regen: number; haunt: number; flash: number; piece: Piece }
/** 光。中心から形どおりに伸びる。ext = 伸びた長さ(px)。中心からの距離が [ext - 帯, ext] の所が光っている */
export interface Blast { x: number; y: number; piece: Piece; ext: number; chain: number }
export interface Chain { id: number; count: number; pts: number; lx: number; ly: number }

export type GameEvent =
  | { type: 'launch'; sx: number; sy: number; x: number; y: number; house: number }
  | { type: 'select'; house: number }
  | { type: 'hang'; x: number; y: number }
  | { type: 'light'; x: number; y: number }
  | { type: 'deny'; x: number; y: number }
  | { type: 'break'; x: number; y: number; chained: boolean }
  | { type: 'caught'; x: number; y: number }
  | { type: 'purify'; x: number; y: number; n: number; pts: number; kind: GhostKind }
  | { type: 'chainEnd'; x: number; y: number; n: number; pts: number }
  | { type: 'haunt'; x: number; y: number; house: number }
  | { type: 'saved'; x: number; y: number; house: number }
  | { type: 'houseOut'; x: number; y: number; house: number; left: number }
  | { type: 'relight'; x: number; y: number; from: [number, number] }
  | { type: 'spawn'; x: number; y: number; kind: GhostKind }
  | { type: 'watch'; n: number }
  | { type: 'waveEnd'; n: number; bonus: number }
  | { type: 'over' };

/** 刻の前の一息 */
export const WAVE_PAUSE = 3.5;
/** おばけが出てくる高さ(巻物の上の外。光の届かない所から降りてくる。出口で待ち伏せはできない) */
const SPAWN_Y = PLAY.y0 - 40;

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
  blasts: Blast[] = [];
  chains = new Map<number, Chain>();
  houses: House[];
  /** 選んでいる家(-1 = 選んでいない。投げると外れる) */
  selected = -1;
  events: GameEvent[] = [];
  wave = 0;
  pause = WAVE_PAUSE;
  readonly pieces: Piece[];
  private nextId = 1;
  private begun = false;
  private queue: Array<{ at: number; g: Group }> = [];
  private groups: Group[];

  /** startWave: その刻から始める(刻ごとの確かめ用。tools/waves.mjs) */
  constructor(seed: number, readonly P: Params, startWave = 0) {
    this.rng = new Rng(seed);
    this.wave = startWave;
    this.pieces = PIECE_SETS[P.pieceSet] ?? PIECE_SETS['縦・横'];
    this.houses = HOUSE_POS.map(([x, y], i) => ({ x, y, lit: true, ammo: P.ammoPerHouse, regen: 0, haunt: 0, flash: 0, piece: this.pieces[i % this.pieces.length] }));
    this.groups = waveGroups(startWave, this.rng);
  }

  get litCount() { return this.houses.filter((h) => h.lit).length; }
  get ammo() { return this.houses.reduce((s, h) => s + (h.lit ? h.ammo : 0), 0); }
  canThrow(i: number) { const h = this.houses[i]; return !!h && h.lit && h.ammo > 0 && h.haunt <= 0; }

  /** 一番近い灯りの家 */
  nearestLit(x: number, y: number): number {
    let best = -1, bd = Infinity;
    this.houses.forEach((h, i) => {
      if (!h.lit) return;
      const d = Math.hypot(h.x - x, h.y - y) + i * 1e-3;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** 行き先に一番近い、投げられる家 */
  launchHouse(x: number, y: number): number {
    let best = -1, bd = Infinity;
    this.houses.forEach((h, i) => {
      if (!this.canThrow(i)) return;
      const d = Math.hypot(h.x - x, h.y - y) + i * 1e-3;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** その家から、その所へ提灯が着くまでの秒 */
  flightTime(x: number, y: number, house = this.launchHouse(x, y)): number {
    if (house < 0) return Infinity;
    const h = this.houses[house];
    return Math.max(0.3, Math.hypot(x - h.x, y - (h.y - 14)) / this.P.flySpeed);
  }

  /**
   * 1 タップ。家 → その家を選ぶ(もう一度で外す)/ 飛んでいる提灯の行き先 → 着いたら下げる /
   * 下がった提灯 → すぐ弾けさせる / それ以外 → 選んだ家(無ければ一番近い家)から、押した所へ投げる
   */
  tap(x: number, y: number) {
    if (this.over) return;
    x = Math.round(x); y = Math.round(y); // 記録(整数)と同じ値で動かす
    if (x < PLAY.x0 || x > PLAY.x1 || y < PLAY.y0 || y > PLAY.y1) return;
    const hi = this.houses.findIndex((h) => Math.hypot(h.x - x, h.y - y) < HOUSE_R);
    if (hi >= 0) {
      if (this.selected === hi) this.selected = -1;
      else if (this.canThrow(hi)) this.selected = hi;
      else { this.events.push({ type: 'deny', x, y }); return; }
      this.events.push({ type: 'select', house: this.selected });
      return;
    }
    const l = this.lanterns.find((q) => Math.hypot(q.tx - x, q.ty - y) < this.P.grabR);
    if (l) {
      if (!l.flying) this.burst(l, null);
      else if (!l.hang) { l.hang = true; this.events.push({ type: 'hang', x: l.tx, y: l.ty }); }
      return;
    }
    const from = this.selected >= 0 && this.canThrow(this.selected) ? this.selected : this.launchHouse(x, y);
    if (from < 0 || this.lanterns.length >= this.P.maxLanterns) { this.events.push({ type: 'deny', x, y }); return; }
    const h = this.houses[from];
    h.ammo--;
    this.selected = -1;
    const sy = h.y - 14;
    this.lanterns.push({ id: this.nextId++, piece: h.piece, tx: x, ty: y, sx: h.x, sy, x: h.x, y: sy, flying: true, flyT: 0, flyDur: this.flightTime(x, y, from), hang: false, age: 0 });
    this.events.push({ type: 'launch', sx: h.x, sy, x, y, house: from });
  }

  /** 光の形の長さ(中心から。周りは半径) */
  reach(piece: Piece) { return piece === 'area' ? this.P.areaReach : piece === 'cross' ? this.P.lineReach * 0.7 : this.P.lineReach; }
  /** 光の帯の長さ(px)。どの所も同じ間(light.hold 秒)だけ照らされる */
  get band() { return Math.max(10, this.P.lightHold * this.P.lightSpeed); }

  /**
   * 点 (x, y) が、光の形の中の「中心から何 px の所」にあるか(形の外なら -1)。r = 当たりの余裕(体の大きさ)
   */
  along(piece: Piece, cx: number, cy: number, x: number, y: number, r = 0): number {
    const dx = x - cx, dy = y - cy, w = this.P.lightWidth / 2 + r, L = this.reach(piece) + r;
    const line = (a: number, b: number) => (Math.abs(b) <= w && Math.abs(a) <= L ? Math.abs(a) : -1);
    switch (piece) {
      case 'vline': return line(dy, dx);
      case 'hline': return line(dx, dy);
      case 'up': return dy <= w && Math.abs(dx) <= w && -dy <= L ? Math.max(0, -dy) : -1;
      case 'down': return dy >= -w && Math.abs(dx) <= w && dy <= L ? Math.max(0, dy) : -1;
      case 'cross': { const a = line(dy, dx), b = line(dx, dy); return a < 0 ? b : b < 0 ? a : Math.min(a, b); }
      case 'area': { const d = Math.hypot(dx, dy); return d <= L ? Math.max(0, d - r) : -1; }
    }
  }

  /** 光がいま (x, y) を照らしているか */
  lit(b: Blast, x: number, y: number, r = 0) {
    const a = this.along(b.piece, b.x, b.y, x, y, r);
    return a >= 0 && a <= b.ext && a >= b.ext - this.band;
  }

  /** 提灯が弾ける。chain があれば誘爆(同じ連鎖として数える) */
  private burst(l: Lantern, chain: Chain | null) {
    const c = chain ?? this.newChain(l.tx, l.ty);
    this.blasts.push({ x: l.tx, y: l.ty, piece: l.piece, ext: 0, chain: c.id });
    this.lanterns = this.lanterns.filter((q) => q !== l);
    this.events.push({ type: 'break', x: l.tx, y: l.ty, chained: !!chain });
  }

  /** 1/60 秒進める */
  step(taps: Array<[number, number]> = []) {
    if (this.over) return;
    for (const [x, y] of taps) this.tap(x, y);
    const P = this.P, dt = DT;
    this.t += dt; this.frame++;
    if (this.selected >= 0 && !this.canThrow(this.selected)) { this.selected = -1; this.events.push({ type: 'select', house: -1 }); }

    this.spawn(dt);

    for (const l of [...this.lanterns]) {
      if (!l.flying) {
        l.age += dt;
        if (l.age >= P.hangTime) this.burst(l, null); // 下がった提灯も、いつも同じ時間で弾ける
        continue;
      }
      l.flyT += dt;
      const k = Math.min(1, l.flyT / l.flyDur);
      l.x = lerp(l.sx, l.tx, k); l.y = lerp(l.sy, l.ty, k);
      if (k >= 1) {
        l.flying = false;
        if (!l.hang) { this.burst(l, null); continue; } // 基本は着いたら弾ける(ミサイルコマンド)
        this.events.push({ type: 'light', x: l.x, y: l.y });
      }
    }

    // 軒先の提灯は時間で少しずつ戻る
    for (const h of this.houses) {
      h.flash = Math.max(0, h.flash - dt);
      if (!h.lit || h.ammo >= P.ammoPerHouse) { h.regen = 0; continue; }
      h.regen += dt;
      if (h.regen >= P.regenTime) { h.regen = 0; h.ammo++; }
    }

    this.moveGhosts(dt);
    this.runBlasts(dt);
    this.closeChains();
    this.runHaunts(dt);

    let n = 0;
    for (const g of this.ghosts) if (!g.dead) this.ghosts[n++] = g;
    this.ghosts.length = n;

    if (this.litCount === 0) { this.over = true; this.events.push({ type: 'over' }); }
  }

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

  private newChain(x: number, y: number): Chain {
    const c: Chain = { id: this.nextId++, count: 0, pts: 0, lx: x, ly: y };
    this.chains.set(c.id, c);
    return c;
  }

  private spawn(dt: number) {
    const P = this.P;
    for (const q of [...this.queue]) {
      if (q.at > this.t) continue;
      this.queue = this.queue.filter((o) => o !== q);
      for (const c of q.g.cols) this.addGhost(q.g.kind, colX(c), q.g.to, q.g.side ?? 1);
    }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        if (this.begun) this.wave++;
        this.begun = true;
        this.events.push({ type: 'watch', n: this.wave });
        for (const g of this.groups) for (let i = 0; i < g.n; i++) this.queue.push({ at: this.t + g.t + i * g.gap, g });
      }
      return;
    }
    if (!this.queue.length && !this.ghosts.length && !this.blasts.length && this.houses.every((h) => h.haunt <= 0)) {
      const bonus = this.litCount * P.waveBonus * (this.wave + 1);
      this.score += bonus;
      this.pause = WAVE_PAUSE;
      this.events.push({ type: 'waveEnd', n: this.wave, bonus });
      this.groups = waveGroups(this.wave + 1, this.rng);
    }
  }

  addGhost(kind: GhostKind, x: number, to?: number, side = 1) {
    const mult = { fuwa: 1, kasa: 1, oni: 1.25 }[kind];
    const ramp = 1 + this.P.speedRamp * Math.max(0, this.wave - 7);
    const y = SPAWN_Y;
    let target = to !== undefined && this.houses[to]?.lit ? to : this.nearestLit(x, y);
    if (target < 0) target = 0;
    const h = this.houses[target];
    const d = Math.hypot(h.x - x, h.y - y) || 1;
    let hx = (h.x - x) / d, hy = (h.y - y) / d;
    if (kind === 'oni') {
      // 曲線: 家の方から横へ大きくそれた向きで出て、少しずつ家の方へ曲がる
      const a = (this.P.curveStart * Math.PI / 180) * side;
      [hx, hy] = [hx * Math.cos(a) - hy * Math.sin(a), hx * Math.sin(a) + hy * Math.cos(a)];
    }
    const g: Ghost = {
      id: this.nextId++, kind, x, y, hx, hy, zig: side, zigLeft: this.P.zigLen / 2,
      speed: this.P.ghostSpeed * mult * ramp, target, age: 0, face: 1, stopped: false, caught: false, haunt: false, dead: false,
    };
    this.ghosts.push(g);
    this.events.push({ type: 'spawn', x, y, kind });
    return g;
  }

  /**
   * おばけを dist px 進める(動き方の決まりはここだけ)。先読み(bot)も同じものを使う。
   *   まっすぐ = 家へ一直線 / ジグザグ = 家への線から ±45° に、決まった長さごとに折れる /
   *   曲線 = それた向きから、決まった速さで家の方へ曲がる
   */
  advance(g: Ghost, dist: number) {
    const h = this.houses[g.target];
    let dx = h.x - g.x, dy = h.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    dx /= d; dy /= d;
    let vx = dx, vy = dy;
    if (g.kind === 'kasa' && d > 50) {
      const s = Math.SQRT1_2;
      vx = (dx - dy * g.zig) * s; vy = (dy + dx * g.zig) * s;
      g.zigLeft -= dist;
      if (g.zigLeft <= 0) { g.zigLeft += this.P.zigLen; g.zig = -g.zig; }
    } else if (g.kind === 'oni' && d > 40) {
      // 向きを、家の方へ最大 curveTurn 度/秒 だけ回す
      const turn = (this.P.curveTurn * Math.PI / 180) * (dist / g.speed);
      const cross = g.hx * dy - g.hy * dx, dot = g.hx * dx + g.hy * dy;
      const a = Math.max(-turn, Math.min(turn, Math.atan2(cross, dot)));
      [g.hx, g.hy] = [g.hx * Math.cos(a) - g.hy * Math.sin(a), g.hx * Math.sin(a) + g.hy * Math.cos(a)];
      vx = g.hx; vy = g.hy;
    }
    const st = Math.min(dist, d);
    const ox = g.x;
    g.x = clamp(g.x + vx * st, PLAY.x0 + 6, PLAY.x1 - 6);
    g.y = clamp(g.y + vy * st, SPAWN_Y, PLAY.y1 - 4);
    if (Math.abs(g.x - ox) > 0.01) g.face = g.x < ox ? -1 : 1;
  }

  /**
   * おばけを動かす。下がった提灯に着いたおばけは見とれて止まる。
   * 止まったおばけのすぐ手前まで来たおばけは、つかえて止まる(せき止め)。前が動けばまた進む
   */
  private moveGhosts(dt: number) {
    const P = this.P;
    const hung = this.lanterns.filter((l) => !l.flying);
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.age += dt;
      if (g.haunt) continue;
      if (!this.houses[g.target].lit) { const t = this.nearestLit(g.x, g.y); if (t >= 0) g.target = t; }
      if (hung.some((l) => Math.hypot(l.tx - g.x, l.ty - g.y) < P.catchR)) {
        if (!g.caught) { g.caught = true; this.events.push({ type: 'caught', x: g.x, y: g.y }); }
        g.stopped = true;
        continue;
      }
      g.caught = false;
      const c: Ghost = { ...g };
      this.advance(c, g.speed * dt);
      const vx = c.x - g.x, vy = c.y - g.y;
      // 前に止まっているおばけがいれば、つかえる
      const blocked = this.ghosts.some((o) => o !== g && !o.dead && o.stopped && !o.haunt
        && Math.hypot(o.x - c.x, o.y - c.y) < P.queueGap && (o.x - g.x) * vx + (o.y - g.y) * vy > 0);
      if (blocked) { g.stopped = true; continue; }
      g.stopped = false;
      Object.assign(g, c);
      const h = this.houses[g.target];
      if (h.lit && Math.hypot(h.x - g.x, h.y - g.y) < HOME_R) {
        g.haunt = true; g.x = h.x; g.y = h.y;
        if (h.haunt <= 0) { h.haunt = P.hauntTime; this.events.push({ type: 'haunt', x: h.x, y: h.y, house: g.target }); }
      }
    }
  }

  /** 先読み: このおばけが step 秒ごとにいる所(止まらないとして) */
  predict(g: Ghost, horizon: number, step = 0.25): Array<{ x: number; y: number; t: number }> {
    const c: Ghost = { ...g };
    const out: Array<{ x: number; y: number; t: number }> = [];
    const house = this.houses[g.target];
    for (let t = 0; t <= horizon; t += step) {
      out.push({ x: c.x, y: c.y, t });
      if (g.haunt || g.stopped || Math.hypot(house.x - c.x, house.y - c.y) < HOME_R) break;
      this.advance(c, c.speed * step);
    }
    return out;
  }

  private runBlasts(dt: number) {
    const P = this.P;
    for (const b of [...this.blasts]) {
      b.ext += P.lightSpeed * dt;
      if (b.ext - this.band > this.reach(b.piece) + GHOST_R) { this.blasts = this.blasts.filter((q) => q !== b); continue; }
      const chain = this.chains.get(b.chain)!;
      // 誘爆: 光が届いた提灯も弾ける(飛んでいるものは除く)
      for (const l of [...this.lanterns]) if (!l.flying && this.lit(b, l.tx, l.ty, 6)) this.burst(l, chain);
      for (const g of this.ghosts) {
        if (g.dead || g.y < PLAY.y0 || !this.lit(b, g.x, g.y, GHOST_R)) continue;
        g.dead = true;
        chain.count++;
        const pts = P.basePts * chain.count;
        chain.pts += pts; this.score += pts; this.purified++;
        chain.lx = g.x; chain.ly = g.y;
        this.events.push({ type: 'purify', x: g.x, y: g.y, n: chain.count, pts, kind: g.kind });
      }
    }
  }

  /** 光が残っていない連鎖を締め、大連鎖なら家の灯りを戻す */
  private closeChains() {
    const alive = new Set<number>();
    for (const b of this.blasts) alive.add(b.chain);
    for (const c of [...this.chains.values()]) {
      if (alive.has(c.id)) continue;
      this.chains.delete(c.id);
      if (c.count === 0) continue;
      this.bestChain = Math.max(this.bestChain, c.count);
      const last: [number, number] = [c.lx, c.ly];
      this.events.push({ type: 'chainEnd', x: last[0], y: last[1], n: c.count, pts: c.pts });
      if (c.count < this.P.relightAt) continue;
      const dark = this.houses.filter((h) => !h.lit);
      if (!dark.length) continue;
      dark.sort((a, b) => Math.hypot(a.x - last[0], a.y - last[1]) - Math.hypot(b.x - last[0], b.y - last[1]));
      dark[0].lit = true; dark[0].flash = 0.8; dark[0].ammo = 1;
      this.events.push({ type: 'relight', x: dark[0].x, y: dark[0].y, from: last });
    }
  }

  drainEvents(): GameEvent[] { const e = this.events; this.events = []; return e; }
}

export function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** タップの入力文字列 "x,y;x,y;" ⇔ 座標 */
export function encodeTaps(taps: Array<[number, number]>) { return taps.map(([x, y]) => `${Math.round(x)},${Math.round(y)};`).join(''); }
export function decodeTaps(s: string): Array<[number, number]> {
  return s.split(';').filter(Boolean).map((p) => { const [x, y] = p.split(',').map(Number); return [x, y] as [number, number]; });
}
