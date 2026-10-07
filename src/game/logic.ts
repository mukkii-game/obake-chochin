// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// ミサイルコマンド × 平安京エイリアン × ボンバーマン × ディグダグ(サインは足さない。見て頭で読む):
//   舞台はマス目の迷路の都(柱のマスと、マスの間の細い板塀)。家は迷路の中ほどに建ち、毎回並びが変わる。
//   おばけは「あの世の口」から来る。動きは種類ごとに決まっている(パックマンの敵のように読める):
//     幽霊 = 迷路を最短の道で歩く / 影法師 = 迷路を歩くが提灯の近くを避ける
//     鬼火 = 壁を無視して家へ一直線 / 唐傘 = 壁を無視してジグザグに来る
//   - 投げる: マスをタップ → 一番近い家から提灯がゆっくり飛ぶ。先に家をタップすれば、その家から投げる(どこへでも)。
//   - 仕掛ける: 着いた提灯は罠。近くのおばけを呼び、着いたおばけはしばらく見とれて動けない。
//   - 弾けさせる: 提灯を押すと、家の形(= 提灯の模様)どおりに光がマスを埋めて走る。上へ一直線 / 下へ一直線 / 周り。
//     光は柱と板塀で止まる。光が届いた提灯も弾ける(誘爆)。成仏したおばけも周りのマスを照らして連鎖する。
//   - 守る: おばけが家に入ると中の人が騒ぎ、間に合わなければ逃げ出して灯りが消える。弾は軒先の提灯の分だけ。
import { Rng } from '../core/rng';
import type { Params } from './params';

export const W = 960;
export const H = 540;
/** 巻物の紙の内側(遊べる範囲) */
export const FIELD = { x0: 70, y0: 46, x1: 890, y1: 494 };
export const DT = 1 / 60;
export const HOUSE_COUNT = 6;

/** マス目。柱は (奇数列, 奇数行) のマス(ボンバーマンの柱) */
export const GRID = { cols: 13, rows: 7, x0: 77, y0: 53, cell: 62 };
export const CELLS = GRID.cols * GRID.rows;
export const cellCol = (n: number) => n % GRID.cols;
export const cellRow = (n: number) => Math.floor(n / GRID.cols);
export const cellAt = (c: number, r: number) => r * GRID.cols + c;
export const cellX = (n: number) => GRID.x0 + (cellCol(n) + 0.5) * GRID.cell;
export const cellY = (n: number) => GRID.y0 + (cellRow(n) + 0.5) * GRID.cell;
export const isPillar = (n: number) => cellCol(n) % 2 === 1 && cellRow(n) % 2 === 1;
export const inGrid = (c: number, r: number) => c >= 0 && r >= 0 && c < GRID.cols && r < GRID.rows;
/** 画面の座標のマス(枠の外は -1) */
export function cellOf(x: number, y: number) {
  const c = Math.floor((x - GRID.x0) / GRID.cell), r = Math.floor((y - GRID.y0) / GRID.cell);
  return inGrid(c, r) ? cellAt(c, r) : -1;
}
/** 上・右・下・左 */
export const DIRS: ReadonlyArray<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const edgeKey = (a: number, b: number) => Math.min(a, b) * 1000 + Math.max(a, b);

export type GhostKind = 'fuwa' | 'oni' | 'kasa' | 'kirai';
/** 迷路を歩く(壁に沿う)か、壁を無視して飛ぶか */
export const WALKS: Record<GhostKind, boolean> = { fuwa: true, kirai: true, oni: false, kasa: false };

/** 提灯の模様 = 光の形。家の形とも対応する */
export type Piece = 'up' | 'down' | 'area' | 'hline' | 'vline' | 'cross';
export const PIECE_SETS: Record<string, Piece[]> = {
  '上・下・周り': ['up', 'down', 'area'],
  '上・下・周り・横': ['up', 'down', 'area', 'hline'],
  '縦・横・十字・周り': ['vline', 'hline', 'cross', 'area'],
};

export interface Ghost {
  id: number; kind: GhostKind;
  x: number; y: number;
  /** 迷路を歩くおばけ: from のマスから to のマスへ、prog px 進んだ所。from === to ならマスの真ん中に立っている */
  from: number; to: number; prog: number; dir: number;
  /** 唐傘: ジグザグの向き(±1)と、次に折れるまでの残り px */
  zig: number; zigLeft: number;
  speed: number; target: number; age: number; face: number;
  /** 呼ばれている提灯の id。0 = 家へ向かう */
  lure: number;
  /** 提灯に見とれている残り秒(罠にかかっている) */
  caught: number;
  /** 家に入り込んでいる(家の人が騒いでいる) */
  haunt: boolean;
  /** もう見とれ終わった提灯(同じ提灯には二度かからない) */
  passed: number[];
  /** その場で待つ残り秒(迷路で道が無い時など) */
  wait: number;
  dead: boolean;
}
export interface Lantern {
  id: number;
  cell: number;
  piece: Piece;
  sx: number; sy: number;
  x: number; y: number;
  flying: boolean; flyT: number; flyDur: number;
  /** 飛んでいる最中に同じマスを押された = 着いたらすぐ弾ける */
  armed: boolean;
  age: number;
}
export interface House { x: number; y: number; cell: number; lit: boolean; ammo: number; haunt: number; flash: number; piece: Piece }
/** あの世の口(おばけの出てくるマス)。刻ごとに場所が変わり、刻の前から見えている */
export interface Portal { x: number; y: number; cell: number }
/** 光。cells のマスを、中心からの順番 d が ext 以下になったものから照らす。留まって、縮む */
export interface Blast {
  x: number; y: number; cells: Array<{ cell: number; d: number }>;
  range: number; ext: number; hold: number; shrinking: boolean;
  chain: number; big: boolean;
}
/** 成仏したおばけ。少しして周りのマスを照らす(敵を利用する連鎖) */
export interface Wisp { id: number; x: number; y: number; cell: number; age: number; chain: number }
export interface Chain { id: number; count: number; pts: number; lx: number; ly: number }

export type GameEvent =
  | { type: 'launch'; sx: number; sy: number; x: number; y: number; house: number }
  | { type: 'select'; house: number }
  | { type: 'arm'; x: number; y: number }
  | { type: 'light'; x: number; y: number }
  | { type: 'deny'; x: number; y: number }
  | { type: 'break'; x: number; y: number; chained: boolean }
  | { type: 'caught'; x: number; y: number }
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
export const WAVE_PAUSE = 3.5;

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
  /** マスの間の細い板塀(ドルアーガの壁)。edgeKey の集合 */
  walls = new Set<number>();
  /** 選んでいる家(-1 = 選んでいない。投げると外れる) */
  selected = -1;
  events: GameEvent[] = [];
  wave = 0;
  waveLeft = 0;
  pause = WAVE_PAUSE;
  readonly pieces: Piece[];
  private nextId = 1;
  private salvoT = 0;
  private portalTurn = 0;
  private begun = false;
  private queue: Array<{ at: number; kind: GhostKind; cell: number }> = [];
  /** 家ごとの「家までの道のり」(迷路の最短距離)。家の灯りが変わるまで使い回す */
  private distCache = new Map<string, Int16Array>();

  constructor(seed: number, readonly P: Params) {
    this.rng = new Rng(seed);
    this.pieces = PIECE_SETS[P.pieceSet] ?? PIECE_SETS['上・下・周り'];
    this.houses = this.layVillage();
    this.buildWalls();
    this.choosePortals(0);
    this.waveLeft = this.waveSize(0);
    for (const h of this.houses) h.ammo = P.ammoPerHouse;
  }

  /** 家並み。毎回変わる(中ほどの段に、間をあけて)。家ごとの提灯の形も毎回変わる */
  private layVillage(): House[] {
    const cells: number[] = [];
    for (let tries = 0; cells.length < HOUSE_COUNT && tries < 3000; tries++) {
      const n = cellAt(this.rng.int(1, GRID.cols - 2), this.rng.int(2, GRID.rows - 3));
      if (isPillar(n)) continue;
      if (cells.every((m) => Math.abs(cellCol(m) - cellCol(n)) + Math.abs(cellRow(m) - cellRow(n)) >= 3)) cells.push(n);
    }
    cells.sort((a, b) => cellCol(a) - cellCol(b));
    const kinds: Piece[] = [];
    for (let i = 0; i < cells.length; i++) kinds.push(this.pieces[i % this.pieces.length]);
    for (let i = kinds.length - 1; i > 0; i--) { const j = this.rng.int(0, i); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    return cells.map((n, i) => ({ x: cellX(n), y: cellY(n), cell: n, lit: true, ammo: 0, haunt: 0, flash: 0, piece: kinds[i] }));
  }

  /** 細い板塀を少し立てる(迷路らしさ)。どのマスからも家へ行けることは保つ */
  private buildWalls() {
    const edges: Array<[number, number]> = [];
    for (let n = 0; n < CELLS; n++) {
      if (isPillar(n)) continue;
      for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
        const c = cellCol(n) + dc, r = cellRow(n) + dr;
        if (!inGrid(c, r)) continue;
        const m = cellAt(c, r);
        if (!isPillar(m)) edges.push([n, m]);
      }
    }
    let placed = 0;
    for (let tries = 0; placed < this.P.wallCount && tries < 300; tries++) {
      const [a, b] = this.rng.pick(edges);
      const k = edgeKey(a, b);
      if (this.walls.has(k) || this.houses.some((h) => h.cell === a || h.cell === b)) continue;
      this.walls.add(k);
      if (this.connected()) placed++; else this.walls.delete(k);
    }
  }

  private connected() {
    const seen = new Uint8Array(CELLS);
    const start = this.houses[0].cell;
    const q = [start]; seen[start] = 1;
    let count = 1;
    while (q.length) {
      const n = q.pop()!;
      for (const m of this.neighbors(n)) if (!seen[m]) { seen[m] = 1; count++; q.push(m); }
    }
    let open = 0;
    for (let n = 0; n < CELLS; n++) if (!isPillar(n)) open++;
    return count === open;
  }

  /** 歩いて行ける隣のマス(柱と板塀は通れない) */
  neighbors(n: number): number[] {
    const out: number[] = [];
    for (const [dc, dr] of DIRS) {
      const c = cellCol(n) + dc, r = cellRow(n) + dr;
      if (!inGrid(c, r)) continue;
      const m = cellAt(c, r);
      if (!isPillar(m) && !this.walls.has(edgeKey(n, m))) out.push(m);
    }
    return out;
  }

  /** 板塀があるか(描画用) */
  wallBetween(a: number, b: number) { return this.walls.has(edgeKey(a, b)); }

  /** そのマスへの迷路の道のり(避けるマスを除いて)。キャッシュする */
  private distField(goal: number, avoid: (n: number) => boolean = () => false, key = ''): Int16Array {
    const ck = `${goal}:${key}`;
    const hit = this.distCache.get(ck);
    if (hit) return hit;
    const d = new Int16Array(CELLS).fill(-1);
    d[goal] = 0;
    const q = [goal];
    for (let i = 0; i < q.length; i++) {
      const n = q[i];
      for (const m of this.neighbors(n)) {
        if (d[m] >= 0 || (avoid(m) && m !== goal)) continue;
        d[m] = d[n] + 1; q.push(m);
      }
    }
    this.distCache.set(ck, d);
    return d;
  }

  /** 迷路の道のり(歩くおばけの数え方) */
  pathDist(a: number, b: number) { const d = this.distField(b)[a]; return d < 0 ? 999 : d; }

  waveSize(n: number) { return Math.round(this.P.waveBase + this.P.waveGrow * n); }

  /** 刻ごとのあの世の口。町の縁のマス。刻が進むと口が増える */
  private choosePortals(n: number) {
    const count = Math.min(3, 1 + Math.floor(n / this.P.portalEvery));
    const edge: number[] = [];
    for (let i = 0; i < CELLS; i++) {
      const c = cellCol(i), r = cellRow(i);
      if (!isPillar(i) && (c === 0 || r === 0 || c === GRID.cols - 1 || r === GRID.rows - 1)) edge.push(i);
    }
    const md = (a: number, b: number) => Math.abs(cellCol(a) - cellCol(b)) + Math.abs(cellRow(a) - cellRow(b));
    const ps: number[] = [];
    for (let tries = 0; ps.length < count && tries < 300; tries++) {
      const n = this.rng.pick(edge);
      if (this.houses.every((h) => md(h.cell, n) >= 4) && ps.every((p) => md(p, n) >= 6)) ps.push(n);
    }
    if (!ps.length) {
      const far = (n: number) => Math.min(...this.houses.map((h) => md(h.cell, n)));
      ps.push(edge.reduce((a, b) => (far(b) > far(a) ? b : a)));
    }
    this.portals = ps.map((c) => ({ x: cellX(c), y: cellY(c), cell: c }));
    this.portalTurn = 0;
    this.events.push({ type: 'portals' });
  }

  get litCount() { return this.houses.filter((h) => h.lit).length; }
  get ammo() { return this.houses.reduce((s, h) => s + (h.lit ? h.ammo : 0), 0); }
  canThrow(i: number) { const h = this.houses[i]; return !!h && h.lit && h.ammo > 0 && h.haunt <= 0; }

  /** 一番近い灯りの家(歩くおばけは迷路の道のり、飛ぶおばけはまっすぐの距離) */
  nearestLit(x: number, y: number, walks: boolean): number {
    let best = -1, bd = Infinity;
    const from = cellOf(x, y);
    this.houses.forEach((h, i) => {
      if (!h.lit) return;
      const d = (walks && from >= 0 ? this.pathDist(from, h.cell) * GRID.cell : Math.hypot(h.x - x, h.y - y)) + i * 1e-3;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** 行き先に一番近い、投げられる家 */
  launchHouse(x: number, y: number): number {
    let best = -1, bd = Infinity;
    this.houses.forEach((h, i) => {
      if (!this.canThrow(i)) return;
      const d = Math.hypot(h.x - x, h.y - y);
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
   * 1 タップ。家 → その家を選ぶ(もう一度で外す)/ 提灯のあるマス → 弾けさせる(飛行中なら着いたら)/
   * それ以外のマス → 選んだ家(無ければ一番近い家)から提灯を投げる
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
      else if (!l.armed) { l.armed = true; this.events.push({ type: 'arm', x: cellX(cell), y: cellY(cell) }); }
      return;
    }
    const tx = cellX(cell), ty = cellY(cell);
    const from = this.selected >= 0 && this.canThrow(this.selected) ? this.selected : this.launchHouse(tx, ty);
    if (isPillar(cell) || from < 0 || this.lanterns.length >= this.P.maxLanterns) { this.events.push({ type: 'deny', x: tx, y: ty }); return; }
    const h = this.houses[from];
    h.ammo--;
    this.selected = -1;
    const sy = h.y - 14;
    this.lanterns.push({ id: this.nextId++, cell, piece: h.piece, sx: h.x, sy, x: h.x, y: sy, flying: true, flyT: 0, flyDur: this.flightTime(cell, from), armed: false, age: 0 });
    this.events.push({ type: 'launch', sx: h.x, sy, x: tx, y: ty, house: from });
  }

  /** 提灯の模様どおりに光が照らすマス(柱と板塀で止まる)。d は中心からの順番 */
  shape(cell: number, piece: Piece): Array<{ cell: number; d: number }> {
    const P = this.P;
    const out = [{ cell, d: 0 }];
    const ray = (dc: number, dr: number, len: number) => {
      let n = cell;
      for (let k = 1; k <= len; k++) {
        const c = cellCol(n) + dc, r = cellRow(n) + dr;
        if (!inGrid(c, r)) break;
        const m = cellAt(c, r);
        if (isPillar(m) || this.walls.has(edgeKey(n, m))) break;
        out.push({ cell: m, d: k }); n = m;
      }
    };
    switch (piece) {
      case 'up': ray(0, -1, P.lineRange); break;
      case 'down': ray(0, 1, P.lineRange); break;
      case 'vline': ray(0, -1, P.lineRange); ray(0, 1, P.lineRange); break;
      case 'hline': ray(-1, 0, P.lineRange); ray(1, 0, P.lineRange); break;
      case 'cross': for (const [dc, dr] of DIRS) ray(dc, dr, Math.ceil(P.lineRange / 2)); break;
      case 'area':
        for (let dr = -P.areaRange; dr <= P.areaRange; dr++) {
          for (let dc = -P.areaRange; dc <= P.areaRange; dc++) {
            const c = cellCol(cell) + dc, r = cellRow(cell) + dr;
            if ((dc || dr) && inGrid(c, r) && !isPillar(cellAt(c, r))) out.push({ cell: cellAt(c, r), d: Math.max(Math.abs(dc), Math.abs(dr)) });
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
    this.blasts.push({ x: cellX(l.cell), y: cellY(l.cell), cells, range: Math.max(...cells.map((q) => q.d), 0.6), ext: 0, hold: this.P.lightHold, shrinking: false, chain: c.id, big: true });
    this.lanterns = this.lanterns.filter((q) => q !== l);
    for (const g of this.ghosts) if (g.lure === l.id) this.release(g);
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
      if (!l.flying) { l.age += dt; continue; }
      l.flyT += dt;
      const k = Math.min(1, l.flyT / l.flyDur);
      l.x = lerp(l.sx, cellX(l.cell), k); l.y = lerp(l.sy, cellY(l.cell), k);
      if (k >= 1) {
        l.flying = false; l.x = cellX(l.cell); l.y = cellY(l.cell);
        if (l.armed) { this.burst(l, null); continue; }
        this.events.push({ type: 'light', x: l.x, y: l.y });
        this.distCache.clear(); // 影法師の避ける道が変わる
      }
    }

    for (const s of [...this.wisps]) {
      s.age += dt;
      if (s.age < P.wispDelay) continue;
      const c = this.chains.get(s.chain) ?? this.newChain(s.x, s.y);
      const cells = [{ cell: s.cell, d: 0 }, ...this.neighbors(s.cell).map((m) => ({ cell: m, d: 1 }))].slice(0, P.wispReach ? 5 : 1);
      this.blasts.push({ x: s.x, y: s.y, cells, range: 1, ext: 0, hold: P.lightHold * 0.5, shrinking: false, chain: c.id, big: false });
      this.wisps = this.wisps.filter((q) => q !== s);
      this.events.push({ type: 'wispPop', x: s.x, y: s.y });
    }

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
      this.distCache.clear();
      this.events.push({ type: 'houseOut', x: h.x, y: h.y, house: i, left: this.litCount });
    });
  }

  private release(g: Ghost) {
    if (g.lure) g.passed.push(g.lure);
    g.lure = 0; g.caught = 0;
    const t = this.nearestLit(g.x, g.y, WALKS[g.kind]);
    if (t >= 0) g.target = t;
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
      this.addGhost(q.kind, q.cell);
      this.queue = this.queue.filter((o) => o !== q);
    }
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
      if (!this.queue.length && !this.ghosts.length && !this.blasts.length && !this.wisps.length && this.houses.every((h) => h.haunt <= 0)) {
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
    this.salvoT = Math.max(P.salvoGapMin, P.salvoGap - 0.25 * n) * (0.85 + this.rng.next() * 0.3);
    const kinds: GhostKind[] = ['fuwa'];
    if (n >= 1) kinds.push('oni');
    if (n >= 2) kinds.push('kasa');
    if (n >= 3) kinds.push('kirai');
    const kind = this.rng.chance(0.35) ? 'fuwa' : this.rng.pick(kinds);
    const size = Math.min(this.waveLeft, this.rng.int(2, Math.min(5, 2 + Math.floor(n / 2))));
    const p = this.portals[this.portalTurn++ % this.portals.length];
    for (let i = 0; i < size; i++) this.queue.push({ at: this.t + i * P.convoyGap, kind: kind === 'kirai' && i > 0 ? 'fuwa' : kind, cell: p.cell });
    this.waveLeft -= size;
  }

  addGhost(kind: GhostKind, cell: number) {
    const mult = { fuwa: 1, oni: 1.15, kasa: 1, kirai: 0.85 }[kind];
    const x = cellX(cell), y = cellY(cell);
    const g: Ghost = {
      id: this.nextId++, kind, x, y, from: cell, to: cell, prog: 0, dir: -1,
      zig: this.rng.chance(0.5) ? 1 : -1, zigLeft: GRID.cell * 0.75,
      speed: this.P.ghostSpeed * mult, target: Math.max(0, this.nearestLit(x, y, WALKS[kind])),
      age: 0, face: 1, lure: 0, caught: 0, haunt: false, passed: [], wait: 0, dead: false,
    };
    this.ghosts.push(g);
    this.events.push({ type: 'spawn', x, y, kind });
    return g;
  }

  /** おばけの今の行き先のマス(呼ばれている提灯、なければ家) */
  goalCell(g: Ghost): number {
    if (g.lure) { const l = this.lanterns.find((q) => q.id === g.lure); if (l) return l.cell; }
    return this.houses[g.target].cell;
  }

  /** 光嫌いが避けるマス(灯った提灯と、その周り) */
  private shunned = (n: number) =>
    this.lanterns.some((l) => !l.flying && Math.abs(cellCol(l.cell) - cellCol(n)) <= 1 && Math.abs(cellRow(l.cell) - cellRow(n)) <= 1);

  /** 迷路を歩くおばけが、マスの真ん中で次のマスを決める(最短の道。同じ近さなら、まっすぐ → 上 → 左 → 下 → 右) */
  chooseNext(g: Ghost, n: number): number {
    const goal = this.goalCell(g);
    const avoid = g.kind === 'kirai';
    const d = avoid ? this.distField(goal, this.shunned, 'shun') : this.distField(goal);
    const opts = this.neighbors(n).filter((m) => d[m] >= 0 && (!avoid || !this.shunned(m) || m === goal));
    if (!opts.length) return -1;
    const order = [0, 3, 2, 1];
    opts.sort((a, b) => {
      if (d[a] !== d[b]) return d[a] - d[b];
      const da = this.dirOf(n, a), db = this.dirOf(n, b);
      if (da === g.dir) return -1;
      if (db === g.dir) return 1;
      return order.indexOf(da) - order.indexOf(db);
    });
    return d[opts[0]] < d[n] || d[n] < 0 ? opts[0] : -1;
  }

  private dirOf(a: number, b: number) {
    const dc = cellCol(b) - cellCol(a), dr = cellRow(b) - cellRow(a);
    return DIRS.findIndex(([x, y]) => x === dc && y === dr);
  }

  /** 呼ばれる: 灯った提灯が近ければ、そちらへ(歩くおばけは迷路の道のり、飛ぶおばけはまっすぐの距離) */
  private tryLure(g: Ghost) {
    if (g.lure || g.kind === 'kirai') return;
    const P = this.P;
    let best = 0, bd = Infinity;
    const here = cellOf(g.x, g.y);
    for (const l of this.lanterns) {
      if (l.flying || g.passed.includes(l.id)) continue;
      const d = WALKS[g.kind] ? (here >= 0 ? this.pathDist(here, l.cell) : 999) : Math.hypot(l.x - g.x, l.y - g.y) / GRID.cell;
      if (d <= P.lureN && d < bd) { bd = d; best = l.id; }
    }
    if (best) g.lure = best;
  }

  /** 着いた所: 罠・家 */
  private arrive(g: Ghost) {
    const P = this.P;
    if (g.lure) {
      const l = this.lanterns.find((q) => q.id === g.lure);
      if (l && Math.hypot(l.x - g.x, l.y - g.y) < 3) { g.caught = P.capture; g.x = l.x; g.y = l.y; this.events.push({ type: 'caught', x: g.x, y: g.y }); }
      return;
    }
    const h = this.houses[g.target];
    if (h.lit && Math.hypot(h.x - g.x, h.y - g.y) < 3) {
      g.haunt = true; g.x = h.x; g.y = h.y;
      if (h.haunt <= 0) { h.haunt = P.hauntTime; this.events.push({ type: 'haunt', x: h.x, y: h.y, house: g.target }); }
    }
  }

  private moveGhosts(dt: number) {
    const P = this.P;
    const ramp = 1 + P.speedRamp * this.wave;
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.age += dt;
      if (g.haunt) continue;
      if (g.lure && !this.lanterns.some((l) => l.id === g.lure)) this.release(g);
      if (g.caught > 0) {
        g.caught -= dt;
        if (g.caught <= 0) this.release(g);
        continue;
      }
      if (!g.lure && !this.houses[g.target].lit) { const t = this.nearestLit(g.x, g.y, WALKS[g.kind]); if (t >= 0) g.target = t; }
      if (g.wait > 0) { g.wait -= dt; continue; }
      this.advance(g, g.speed * ramp * dt, true);
    }
  }

  /**
   * おばけを dist px 進める(動き方の決まりはここだけ)。live = false なら先読み用(呼ばれず、罠や家にも入らない)
   */
  advance(g: Ghost, dist: number, live: boolean) {
    const ox = g.x;
    if (WALKS[g.kind]) {
      // 迷路を歩く: マスの真ん中から真ん中へ
      let left = dist;
      for (let guard = 0; left > 0 && guard < 4; guard++) {
        if (g.from === g.to) {
          if (live) { this.tryLure(g); this.arrive(g); if (g.caught > 0 || g.haunt) return; }
          if (g.from === this.goalCell(g)) return;
          const nx = this.chooseNext(g, g.from);
          if (nx < 0) { if (live) g.wait = 0.4; return; }
          g.dir = this.dirOf(g.from, nx); g.to = nx; g.prog = 0;
        }
        const len = GRID.cell;
        const st = Math.min(left, len - g.prog);
        g.prog += st; left -= st;
        if (g.prog >= len - 1e-6) { g.from = g.to; g.prog = 0; g.x = cellX(g.from); g.y = cellY(g.from); continue; }
        const k = g.prog / len;
        g.x = lerp(cellX(g.from), cellX(g.to), k); g.y = lerp(cellY(g.from), cellY(g.to), k);
      }
      if (live && g.from === g.to) { this.tryLure(g); this.arrive(g); }
    } else {
      // 壁を無視して飛ぶ
      if (live) this.tryLure(g);
      const goal = this.goalCell(g);
      const tx = cellX(goal), ty = cellY(goal);
      let dx = tx - g.x, dy = ty - g.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) { if (live) this.arrive(g); return; }
      dx /= d; dy /= d;
      let vx = dx, vy = dy;
      if (g.kind === 'kasa' && d > GRID.cell * 0.9 && !g.lure) {
        // 唐傘: 行き先への線から ±45° に、決まった長さごとに折れる(ジグザグ)
        const s = Math.SQRT1_2;
        vx = (dx - dy * g.zig) * s; vy = (dy + dx * g.zig) * s;
        g.zigLeft -= dist;
        if (g.zigLeft <= 0) { g.zigLeft += GRID.cell * 1.5; g.zig = -g.zig; }
      }
      const st = Math.min(dist, d);
      g.x += vx * st; g.y += vy * st;
      g.x = clamp(g.x, GRID.x0 + 4, GRID.x0 + GRID.cols * GRID.cell - 4);
      g.y = clamp(g.y, GRID.y0 + 4, GRID.y0 + GRID.rows * GRID.cell - 4);
      if (live && Math.hypot(tx - g.x, ty - g.y) < 3) { g.x = tx; g.y = ty; this.arrive(g); }
    }
    if (Math.abs(g.x - ox) > 0.01) g.face = g.x < ox ? -1 : 1;
  }

  /** 先読み: このおばけが t 秒ごとにいるマス(呼ばれない・罠にかからないとして) */
  predict(g: Ghost, horizon: number, step = 0.25): Array<{ cell: number; t: number; x: number; y: number }> {
    const c: Ghost = { ...g, passed: [...g.passed], lure: 0, caught: 0 };
    const sp = g.speed * (1 + this.P.speedRamp * this.wave);
    const out: Array<{ cell: number; t: number; x: number; y: number }> = [];
    let t = Math.max(0, g.wait) + Math.max(0, g.caught);
    const house = this.houses[g.target];
    while (t <= horizon) {
      out.push({ cell: cellOf(c.x, c.y), t, x: c.x, y: c.y });
      if (Math.hypot(house.x - c.x, house.y - c.y) < 3) break;
      this.advance(c, sp * step, false);
      t += step;
    }
    return out;
  }

  /** そのマスが光に照らされているか */
  lit(b: Blast, cell: number) {
    return b.cells.some((q) => q.cell === cell && q.d <= b.ext);
  }

  private runBlasts(dt: number) {
    const P = this.P;
    for (const b of [...this.blasts]) {
      if (!b.shrinking) {
        b.ext = Math.min(b.range, b.ext + P.lightSpeed * dt);
        if (b.ext >= b.range) { b.hold -= dt; if (b.hold <= 0) b.shrinking = true; }
      } else b.ext -= P.lightSpeed * 2 * dt;
      if (b.ext < 0 && b.shrinking) { this.blasts = this.blasts.filter((q) => q !== b); continue; }
      const chain = this.chains.get(b.chain)!;
      // 誘爆: 光が届いたマスの提灯も弾ける
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
        // 成仏したおばけは、少しして自分のマスと周りを照らす
        if (this.wisps.length < 50 && !isPillar(cell)) this.wisps.push({ id: this.nextId++, x: cellX(cell), y: cellY(cell), cell, age: 0, chain: chain.id });
      }
    }
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
      if (c.count < this.P.relightAt) continue;
      const dark = this.houses.filter((h) => !h.lit);
      if (!dark.length) continue;
      dark.sort((a, b) => Math.hypot(a.x - last[0], a.y - last[1]) - Math.hypot(b.x - last[0], b.y - last[1]));
      dark[0].lit = true; dark[0].flash = 0.8; dark[0].ammo = 1;
      this.distCache.clear();
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
