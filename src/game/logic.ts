// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// 芯はミサイルコマンド(時限。サインは足さない。見て頭で読む):
//   - 投げる: マスをタップ → 家から提灯がゆっくり飛び、着いた所で弾ける(着くまでの時間を読む)。
//     光は家の形どおり(縦の楼 = 縦一列 / 長屋 = 横一列)に帯になって走る。光に触れたおばけは成仏。
//   - その上に、プレイヤーが時を操る余地(平安京エイリアン・ディグダグ):
//     飛んでいる提灯をもう一度押すと、着いても弾けずに下がる。下がった提灯にたどり着いたおばけは見とれて止まり、
//     後ろのおばけはつかえて詰まる(せき止め)。下がった提灯は決まった時間で弾ける(押せばすぐ)。
//   - 光が届いた提灯も弾ける(誘爆。プレイヤーが並べた分だけ)。おばけどうしは連鎖しない。
//   - おばけは上から、決まった動き(まっすぐ / ジグザグ / 曲線)で家へ来る。刻ごとの出方は waves.ts。
//   - 弾は軒先の提灯。時間で少しずつ戻る。
import { Rng } from '../core/rng';
import type { Params } from './params';
import { waveGroups, type Group } from './waves';

export const W = 960;
export const H = 540;
/** 巻物の紙の内側(遊べる範囲) */
export const FIELD = { x0: 70, y0: 46, x1: 890, y1: 494 };
export const DT = 1 / 60;

/** マス目(地形は無い。光の形と、提灯を下げる場所の単位) */
export const GRID = { cols: 13, rows: 7, x0: 77, y0: 53, cell: 62 };
export const CELLS = GRID.cols * GRID.rows;
export const cellCol = (n: number) => n % GRID.cols;
export const cellRow = (n: number) => Math.floor(n / GRID.cols);
export const cellAt = (c: number, r: number) => r * GRID.cols + c;
export const cellX = (n: number) => GRID.x0 + (cellCol(n) + 0.5) * GRID.cell;
export const cellY = (n: number) => GRID.y0 + (cellRow(n) + 0.5) * GRID.cell;
export const colX = (c: number) => GRID.x0 + (c + 0.5) * GRID.cell;
export const inGrid = (c: number, r: number) => c >= 0 && r >= 0 && c < GRID.cols && r < GRID.rows;
/** 画面の座標のマス(枠の外は -1) */
export function cellOf(x: number, y: number) {
  const c = Math.floor((x - GRID.x0) / GRID.cell), r = Math.floor((y - GRID.y0) / GRID.cell);
  return inGrid(c, r) ? cellAt(c, r) : -1;
}
/** 家の並ぶ列(一番下の段) */
export const HOUSE_COLS = [1, 3, 5, 7, 9, 11];
export const HOUSE_ROW = GRID.rows - 1;

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
  /** 下がった提灯のマスで見とれている */
  caught: boolean;
  /** 家に入り込んでいる(家の人が騒いでいる) */
  haunt: boolean;
  dead: boolean;
}
export interface Lantern {
  id: number;
  cell: number;
  piece: Piece;
  sx: number; sy: number;
  x: number; y: number;
  flying: boolean; flyT: number; flyDur: number;
  /** 飛んでいる最中にもう一度押された = 着いても弾けずに下がる */
  hang: boolean;
  /** 下がってからの秒 */
  age: number;
}
export interface House { x: number; y: number; cell: number; lit: boolean; ammo: number; regen: number; haunt: number; flash: number; piece: Piece }
/** あの世の口(おばけの出てくる所)。刻の前から見えている */
export interface Portal { x: number; y: number; cell: number }
/** 光。cells のマスを、中心からの順番 d の順に帯になって走る */
export interface Blast {
  x: number; y: number; cells: Array<{ cell: number; d: number }>;
  range: number; ext: number; chain: number;
}
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
  | { type: 'portals' }
  | { type: 'watch'; n: number }
  | { type: 'waveEnd'; n: number; bonus: number }
  | { type: 'over' };

/** 刻の前の一息(この間に、次のあの世の口が見えている) */
export const WAVE_PAUSE = 3.5;
/** おばけが出てくる高さ(巻物の上の外。光の届かない所から降りてくる。出口で待ち伏せはできない) */
const SPAWN_Y = GRID.y0 - 40;
/** おばけが家に入ったとみなす近さ */
const HOME_R = 14;

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
  portals: Portal[] = [];
  /** 選んでいる家(-1 = 選んでいない。投げると外れる) */
  selected = -1;
  events: GameEvent[] = [];
  wave = 0;
  pause = WAVE_PAUSE;
  readonly pieces: Piece[];
  private nextId = 1;
  private begun = false;
  private queue: Array<{ at: number; g: Group; i: number }> = [];
  private groups: Group[];

  constructor(seed: number, readonly P: Params) {
    this.rng = new Rng(seed);
    this.pieces = PIECE_SETS[P.pieceSet] ?? PIECE_SETS['縦・横'];
    // 家並み: 一番下の段に 6 軒(ミサイルコマンドの町)。形(= 光の形)は左から順に並べる
    this.houses = HOUSE_COLS.map((c, i) => {
      const n = cellAt(c, HOUSE_ROW);
      return { x: cellX(n), y: cellY(n), cell: n, lit: true, ammo: P.ammoPerHouse, regen: 0, haunt: 0, flash: 0, piece: this.pieces[i % this.pieces.length] };
    });
    this.groups = waveGroups(0, this.rng);
    this.showPortals();
  }

  get litCount() { return this.houses.filter((h) => h.lit).length; }
  get ammo() { return this.houses.reduce((s, h) => s + (h.lit ? h.ammo : 0), 0); }
  canThrow(i: number) { const h = this.houses[i]; return !!h && h.lit && h.ammo > 0 && h.haunt <= 0; }

  /** 刻ごとのあの世の口 = その刻におばけが出てくる所(一番上の段) */
  private showPortals() {
    const cols = [...new Set(this.groups.flatMap((g) => g.cols.map((c) => Math.round(c))))].sort((a, b) => a - b);
    this.portals = cols.map((c) => { const n = cellAt(Math.max(0, Math.min(GRID.cols - 1, c)), 0); return { x: colX(c), y: cellY(n), cell: n }; });
    this.events.push({ type: 'portals' });
  }

  /** 一番近い灯りの家(まっすぐの距離) */
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

  /** その家から、そのマスへ提灯が着くまでの秒 */
  flightTime(cell: number, house = this.launchHouse(cellX(cell), cellY(cell))): number {
    if (house < 0) return Infinity;
    const h = this.houses[house];
    return Math.max(0.3, Math.hypot(cellX(cell) - h.x, cellY(cell) - h.y) / this.P.flySpeed);
  }

  /**
   * 1 タップ。家 → その家を選ぶ(もう一度で外す)/ 飛んでいる提灯のマス → 着いたら下げる /
   * 下がった提灯のマス → すぐ弾けさせる / それ以外のマス → 選んだ家(無ければ一番近い家)から投げる
   */
  tap(x: number, y: number) {
    if (this.over) return;
    x = Math.round(x); y = Math.round(y); // 記録(整数)と同じ値で動かす
    const cell = cellOf(x, y);
    if (cell < 0) return;
    const hi = this.houses.findIndex((h) => h.cell === cell);
    if (hi >= 0) {
      if (this.selected === hi) this.selected = -1;
      else if (this.canThrow(hi)) this.selected = hi;
      else { this.events.push({ type: 'deny', x: cellX(cell), y: cellY(cell) }); return; }
      this.events.push({ type: 'select', house: this.selected });
      return;
    }
    const l = this.lanterns.find((q) => q.cell === cell);
    if (l) {
      if (!l.flying) this.burst(l, null);
      else if (!l.hang) { l.hang = true; this.events.push({ type: 'hang', x: cellX(cell), y: cellY(cell) }); }
      return;
    }
    const tx = cellX(cell), ty = cellY(cell);
    const from = this.selected >= 0 && this.canThrow(this.selected) ? this.selected : this.launchHouse(tx, ty);
    if (from < 0 || this.lanterns.length >= this.P.maxLanterns) { this.events.push({ type: 'deny', x: tx, y: ty }); return; }
    const h = this.houses[from];
    h.ammo--;
    this.selected = -1;
    const sy = h.y - 14;
    this.lanterns.push({ id: this.nextId++, cell, piece: h.piece, sx: h.x, sy, x: h.x, y: sy, flying: true, flyT: 0, flyDur: this.flightTime(cell, from), hang: false, age: 0 });
    this.events.push({ type: 'launch', sx: h.x, sy, x: tx, y: ty, house: from });
  }

  /** 提灯の模様どおりに光が照らすマス。d は中心からの順番 */
  shape(cell: number, piece: Piece): Array<{ cell: number; d: number }> {
    const P = this.P;
    const out = [{ cell, d: 0 }];
    const ray = (dc: number, dr: number, len: number) => {
      for (let k = 1; k <= len; k++) {
        const c = cellCol(cell) + dc * k, r = cellRow(cell) + dr * k;
        if (!inGrid(c, r)) break;
        out.push({ cell: cellAt(c, r), d: k });
      }
    };
    switch (piece) {
      case 'up': ray(0, -1, P.lineRange); break;
      case 'down': ray(0, 1, P.lineRange); break;
      case 'vline': ray(0, -1, P.lineRange); ray(0, 1, P.lineRange); break;
      case 'hline': ray(-1, 0, P.lineRange); ray(1, 0, P.lineRange); break;
      case 'cross': for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) ray(dc, dr, Math.ceil(P.lineRange / 2)); break;
      case 'area':
        for (let dr = -P.areaRange; dr <= P.areaRange; dr++) {
          for (let dc = -P.areaRange; dc <= P.areaRange; dc++) {
            const c = cellCol(cell) + dc, r = cellRow(cell) + dr;
            if ((dc || dr) && inGrid(c, r)) out.push({ cell: cellAt(c, r), d: Math.max(Math.abs(dc), Math.abs(dr)) });
          }
        }
        break;
    }
    return out;
  }

  /** 提灯が弾ける。chain があれば誘爆(同じ連鎖として数える) */
  private burst(l: Lantern, chain: Chain | null) {
    const c = chain ?? this.newChain(l.x, l.y);
    const cells = this.shape(l.cell, l.piece);
    this.blasts.push({ x: cellX(l.cell), y: cellY(l.cell), cells, range: Math.max(...cells.map((q) => q.d), 0), ext: 0, chain: c.id });
    this.lanterns = this.lanterns.filter((q) => q !== l);
    this.events.push({ type: 'break', x: l.x, y: l.y, chained: !!chain });
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
        if (l.age >= P.hangTime) this.burst(l, null); // 下がった提灯も、決まった時間で弾ける
        continue;
      }
      l.flyT += dt;
      const k = Math.min(1, l.flyT / l.flyDur);
      l.x = lerp(l.sx, cellX(l.cell), k); l.y = lerp(l.sy, cellY(l.cell), k);
      if (k >= 1) {
        l.flying = false; l.x = cellX(l.cell); l.y = cellY(l.cell);
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
        for (const g of this.groups) for (let i = 0; i < g.n; i++) this.queue.push({ at: this.t + g.t + i * g.gap, g, i });
      }
      return;
    }
    if (!this.queue.length && !this.ghosts.length && !this.blasts.length && this.houses.every((h) => h.haunt <= 0)) {
      const bonus = this.litCount * P.waveBonus * (this.wave + 1);
      this.score += bonus;
      this.pause = WAVE_PAUSE;
      this.events.push({ type: 'waveEnd', n: this.wave, bonus });
      this.groups = waveGroups(this.wave + 1, this.rng);
      this.showPortals();
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
    if (g.kind === 'kasa' && d > GRID.cell * 0.8) {
      const s = Math.SQRT1_2;
      vx = (dx - dy * g.zig) * s; vy = (dy + dx * g.zig) * s;
      g.zigLeft -= dist;
      if (g.zigLeft <= 0) { g.zigLeft += this.P.zigLen; g.zig = -g.zig; }
    } else if (g.kind === 'oni' && d > GRID.cell * 0.6) {
      // 向きを、家の方へ最大 curveTurn 度/秒 だけ回す
      const turn = (this.P.curveTurn * Math.PI / 180) * (dist / g.speed);
      const cross = g.hx * dy - g.hy * dx, dot = g.hx * dx + g.hy * dy;
      const ang = Math.atan2(cross, dot);
      const a = Math.max(-turn, Math.min(turn, ang));
      [g.hx, g.hy] = [g.hx * Math.cos(a) - g.hy * Math.sin(a), g.hx * Math.sin(a) + g.hy * Math.cos(a)];
      vx = g.hx; vy = g.hy;
    }
    const st = Math.min(dist, d);
    const ox = g.x;
    g.x += vx * st; g.y += vy * st;
    g.x = clamp(g.x, GRID.x0 + 4, GRID.x0 + GRID.cols * GRID.cell - 4);
    g.y = clamp(g.y, SPAWN_Y, GRID.y0 + GRID.rows * GRID.cell - 4);
    if (Math.abs(g.x - ox) > 0.01) g.face = g.x < ox ? -1 : 1;
  }

  /**
   * おばけを動かす。下がった提灯のマスに入ったおばけは見とれて止まる。
   * 止まったおばけで埋まったマス(ghost.dam 体)には、後ろのおばけは入れず、手前で止まる(せき止め)
   */
  private moveGhosts(dt: number) {
    const P = this.P;
    const hung = new Set(this.lanterns.filter((l) => !l.flying).map((l) => l.cell));
    const full = new Map<number, number>();
    for (const g of this.ghosts) if (!g.dead && g.stopped) { const c = cellOf(g.x, g.y); full.set(c, (full.get(c) ?? 0) + 1); }
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.age += dt;
      if (g.haunt) continue;
      if (!this.houses[g.target].lit) { const t = this.nearestLit(g.x, g.y); if (t >= 0) g.target = t; }
      const here = cellOf(g.x, g.y);
      if (hung.has(here)) {
        if (!g.caught) { g.caught = true; this.events.push({ type: 'caught', x: g.x, y: g.y }); }
        if (!g.stopped) { g.stopped = true; full.set(here, (full.get(here) ?? 0) + 1); }
        continue;
      }
      g.caught = false;
      const c: Ghost = { ...g };
      this.advance(c, g.speed * dt);
      const next = cellOf(c.x, c.y);
      if (next !== here && (full.get(next) ?? 0) >= P.damCap) {
        if (!g.stopped) { g.stopped = true; full.set(here, (full.get(here) ?? 0) + 1); }
        continue;
      }
      if (g.stopped) { g.stopped = false; full.set(here, Math.max(0, (full.get(here) ?? 1) - 1)); }
      Object.assign(g, c);
      const h = this.houses[g.target];
      if (h.lit && Math.hypot(h.x - g.x, h.y - g.y) < HOME_R) {
        g.haunt = true; g.x = h.x; g.y = h.y;
        if (h.haunt <= 0) { h.haunt = P.hauntTime; this.events.push({ type: 'haunt', x: h.x, y: h.y, house: g.target }); }
      }
    }
  }

  /** 先読み: このおばけが step 秒ごとにいる所(止まらないとして) */
  predict(g: Ghost, horizon: number, step = 0.25): Array<{ cell: number; t: number; x: number; y: number }> {
    const c: Ghost = { ...g };
    const out: Array<{ cell: number; t: number; x: number; y: number }> = [];
    const house = this.houses[g.target];
    for (let t = 0; t <= horizon; t += step) {
      out.push({ cell: cellOf(c.x, c.y), t, x: c.x, y: c.y });
      if (g.haunt || g.stopped || Math.hypot(house.x - c.x, house.y - c.y) < HOME_R) break;
      this.advance(c, c.speed * step);
    }
    return out;
  }

  /** 光の帯の長さ(マス)。光は帯になって形の上を走り、どのマスも同じ間(light.hold 秒)だけ照らされる */
  get band() { return Math.max(0.3, this.P.lightHold * this.P.lightSpeed); }

  /** そのマスが光に照らされているか */
  lit(b: Blast, cell: number) {
    const band = this.band;
    return b.cells.some((q) => q.cell === cell && q.d <= b.ext && q.d >= b.ext - band);
  }

  private runBlasts(dt: number) {
    const P = this.P;
    for (const b of [...this.blasts]) {
      b.ext += P.lightSpeed * dt;
      if (b.ext - this.band > b.range) { this.blasts = this.blasts.filter((q) => q !== b); continue; }
      const chain = this.chains.get(b.chain)!;
      // 誘爆: 光が届いたマスの提灯も弾ける(飛んでいるものは除く)
      for (const l of [...this.lanterns]) if (!l.flying && this.lit(b, l.cell)) this.burst(l, chain);
      for (const g of this.ghosts) {
        if (g.dead) continue;
        const cell = cellOf(g.x, g.y);
        if (cell < 0 || !this.lit(b, cell)) continue;
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
