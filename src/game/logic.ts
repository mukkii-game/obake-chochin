// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// ミサイルコマンド × 平安京エイリアン × ボンバーマン(サインは足さない。見て頭で読む):
//   舞台は碁盤の目の都。おばけは「あの世の口」から、通りを歩いて一番近い灯りの家へ向かう。曲がるのは辻だけ。
//   曲がり方は種類ごとに決まっている(読めるが読み切れない)。
//   - 投げる(ミサイルコマンド): タップした辻へ、近くの家から提灯がゆっくり飛ぶ。着くまでにおばけは進む。
//   - 仕掛ける(平安京エイリアン): 着いた提灯は辻に下がる罠。近くの通りのおばけを呼び、来たおばけはしばらく見とれて動けない。
//   - 弾けさせる(ボンバーマン): 提灯を押すと、光が十字に通りをゆっくり走る。光に触れた提灯も弾ける(誘爆)。
//     成仏したおばけも小さく十字に弾ける。並べて仕込めば、普段届かない所まで届く。
//   - 守る: おばけが家に入ると中の人が騒ぎ、間に合わなければ逃げ出して灯りが消える。弾(提灯)は家の軒先にある分だけ。
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

/** 碁盤の目。辻(交差点)は cols × rows */
export const GRID = { cols: 12, rows: 6, x0: 104, y0: 84, dx: 68, dy: 74 };
export const nodeCol = (n: number) => n % GRID.cols;
export const nodeRow = (n: number) => Math.floor(n / GRID.cols);
export const nodeX = (n: number) => GRID.x0 + nodeCol(n) * GRID.dx;
export const nodeY = (n: number) => GRID.y0 + nodeRow(n) * GRID.dy;
export const nodeAt = (c: number, r: number) => r * GRID.cols + c;
/** 辻どうしの道のり(通りを歩いた時の辻の数) */
export const gridDist = (a: number, b: number) => Math.abs(nodeCol(a) - nodeCol(b)) + Math.abs(nodeRow(a) - nodeRow(b));
/** 画面の座標に一番近い辻 */
export function nearestNode(x: number, y: number) {
  const c = clamp(Math.round((x - GRID.x0) / GRID.dx), 0, GRID.cols - 1);
  const r = clamp(Math.round((y - GRID.y0) / GRID.dy), 0, GRID.rows - 1);
  return nodeAt(c, r);
}
const DIRS: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export type GhostKind = 'fuwa' | 'zig' | 'hop' | 'kirai';

/** 提灯の駒(将棋の動きで光が走る)。家ごとに決まっていて、遊ぶたびに変わる */
export type Piece = 'hisha' | 'kaku' | 'kyo' | 'kei';
export const PIECE_CHAR: Record<Piece, string> = { hisha: '飛', kaku: '角', kyo: '香', kei: '桂' };
/** 光の筋(dc, dr の向きに len 辻ぶん) */
export interface Ray { dc: number; dr: number; len: number }

/** 駒の光の形。fwd は投げた向き(香・桂の「前」) */
export function pieceShape(piece: Piece, fwd: [number, number], P: { range: number; lanceRange: number }): { rays: Ray[]; jumps: Array<[number, number]> } {
  const [fc, fr] = fwd;
  switch (piece) {
    case 'hisha': return { rays: [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => ({ dc, dr, len: P.range })), jumps: [] };
    case 'kaku': return { rays: [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dc, dr]) => ({ dc, dr, len: P.range })), jumps: [] };
    case 'kyo': return { rays: [{ dc: fc, dr: fr, len: P.lanceRange }], jumps: [] };
    case 'kei': return { rays: [], jumps: [[fc * 2 + fr, fr * 2 + fc], [fc * 2 - fr, fr * 2 - fc]] };
  }
}

export interface Ghost {
  id: number; kind: GhostKind;
  /** 通りの上の位置(いつも通りの線の上) */
  x: number; y: number;
  /** いま歩いている通り: from の辻から to の辻へ、prog px 進んだ所。from === to なら辻に立っている */
  from: number; to: number; prog: number;
  /** 最後に進んだ向き(DIRS の番号) */
  dir: number;
  /** ふらふら: 次に縦横どちらを優先するか(辻ごとに入れ替わる = 階段のような道) */
  prefH: boolean;
  speed: number; target: number; age: number; face: number;
  /** 呼ばれている提灯の id。0 = 家へ向かう */
  lure: number;
  /** 提灯に見とれている残り秒(罠にかかっている) */
  caught: number;
  /** 家に入り込んでいる(家の人が騒いでいる) */
  haunt: boolean;
  /** もう見とれ終わった提灯(同じ提灯には二度かからない) */
  passed: number[];
  /** 唐傘: 辻で止まっている残り秒 */
  pause: number;
  dead: boolean;
}
export interface Lantern {
  id: number;
  /** 下がる辻 */
  node: number;
  /** 飛び立った家の位置 */
  sx: number; sy: number;
  x: number; y: number;
  flying: boolean; flyT: number; flyDur: number;
  /** 飛んでいる最中に同じ辻を押された = 着いたらすぐ弾ける */
  armed: boolean;
  /** 灯ってからの秒 */
  age: number;
  /** 駒(投げた家の駒)と、投げた向き */
  piece: Piece; fwd: [number, number];
}
export interface House { x: number; y: number; node: number; lit: boolean; ammo: number; haunt: number; flash: number; piece: Piece }
/** あの世の口(おばけの出てくる辻)。刻ごとに場所が変わり、刻の前から見えている */
export interface Portal { x: number; y: number; node: number }
/** 光。駒の形の筋に沿って ext(辻いくつ分)まで広がり、留まって、縮む。桂は跳んだ先の辻が光る */
export interface Blast {
  x: number; y: number; rays: Ray[]; jumps: Array<{ x: number; y: number }>;
  range: number; ext: number; hold: number; shrinking: boolean;
  chain: number; big: boolean;
}
/** 成仏したおばけ。少しして小さく十字に弾ける(敵を利用する連鎖) */
export interface Wisp { id: number; x: number; y: number; h: boolean; v: boolean; age: number; chain: number }
export interface Chain { id: number; count: number; pts: number; lx: number; ly: number }

export type GameEvent =
  | { type: 'launch'; sx: number; sy: number; x: number; y: number; house: number }
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
export const WAVE_PAUSE = 3.0;

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
  /** 群れは同じ口から少しずつ間をあけて出る(通りに列を作る) */
  private queue: Array<{ at: number; kind: GhostKind; node: number }> = [];

  constructor(seed: number, readonly P: Params) {
    this.rng = new Rng(seed);
    this.houses = this.layVillage();
    this.choosePortals(0);
    this.waveLeft = this.waveSize(0);
    for (const h of this.houses) h.ammo = P.ammoPerHouse;
  }

  /** 家並み。毎回変わる(中ほどの辻に、間をあけて) */
  private layVillage(): House[] {
    const nodes: number[] = [];
    for (let tries = 0; nodes.length < HOUSE_COUNT && tries < 3000; tries++) {
      const n = nodeAt(this.rng.int(1, GRID.cols - 2), this.rng.int(1, GRID.rows - 2));
      if (nodes.every((m) => gridDist(m, n) >= 3)) nodes.push(n);
    }
    nodes.sort((a, b) => nodeCol(a) - nodeCol(b));
    // 家ごとの駒(遊ぶたびに変わる)。飛と角は 2 軒ずつ、香と桂は 1 軒ずつ
    const pieces: Piece[] = ['hisha', 'hisha', 'kaku', 'kaku', 'kyo', 'kei'];
    for (let i = pieces.length - 1; i > 0; i--) { const j = this.rng.int(0, i); [pieces[i], pieces[j]] = [pieces[j], pieces[i]]; }
    return nodes.map((n, i) => ({ x: nodeX(n), y: nodeY(n), node: n, lit: true, ammo: 0, haunt: 0, flash: 0, piece: pieces[i % pieces.length] }));
  }

  waveSize(n: number) { return Math.round(this.P.waveBase + this.P.waveGrow * n); }

  /** 刻ごとのあの世の口。町の縁の辻。刻が進むと口が増える */
  private choosePortals(n: number) {
    const count = Math.min(3, 1 + Math.floor(n / this.P.portalEvery));
    const edge: number[] = [];
    for (let i = 0; i < GRID.cols * GRID.rows; i++) {
      const c = nodeCol(i), r = nodeRow(i);
      if (c === 0 || r === 0 || c === GRID.cols - 1 || r === GRID.rows - 1) edge.push(i);
    }
    const ps: number[] = [];
    for (let tries = 0; ps.length < count && tries < 300; tries++) {
      const n = this.rng.pick(edge);
      if (this.houses.every((h) => gridDist(h.node, n) >= 4) && ps.every((p) => gridDist(p, n) >= 6)) ps.push(n);
    }
    if (!ps.length) {
      // 置ける所が無ければ、家から一番遠い縁の辻
      const far = (n: number) => Math.min(...this.houses.map((h) => gridDist(h.node, n)));
      ps.push(edge.reduce((a, b) => (far(b) > far(a) ? b : a)));
    }
    this.portals = ps.map((n) => ({ x: nodeX(n), y: nodeY(n), node: n }));
    this.portalTurn = 0;
    this.events.push({ type: 'portals' });
  }

  get litCount() { return this.houses.filter((h) => h.lit).length; }
  get ammo() { return this.houses.reduce((s, h) => s + (h.lit ? h.ammo : 0), 0); }

  /** 通りを歩いて一番近い、灯りのついた家 */
  nearestLit(node: number): number {
    let best = -1, bd = Infinity;
    this.houses.forEach((h, i) => {
      if (!h.lit) return;
      const d = gridDist(h.node, node) + i * 1e-3;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** 行き先に一番近い、提灯の残っている家 */
  launchHouse(x: number, y: number): number {
    let best = -1, bd = Infinity;
    this.houses.forEach((h, i) => {
      if (!h.lit || h.ammo <= 0 || h.haunt > 0) return; // 騒いでいる家は投げられない
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** 提灯がその辻に着くまでの秒(bot の先読み用にも公開) */
  flightTime(node: number): number {
    const i = this.launchHouse(nodeX(node), nodeY(node));
    if (i < 0) return Infinity;
    const h = this.houses[i];
    return Math.max(0.25, Math.hypot(nodeX(node) - h.x, nodeY(node) - (h.y - 18)) / this.P.flySpeed);
  }

  /** 1 タップ。押した所に一番近い辻に提灯があれば → 弾けさせる(飛行中なら着いたら)/ 無ければ → 投げる */
  tap(x: number, y: number) {
    if (this.over) return;
    x = Math.round(x); y = Math.round(y); // 記録(整数)と同じ値で動かす
    const node = nearestNode(x, y);
    const l = this.lanterns.find((q) => q.node === node);
    if (l) {
      if (!l.flying) this.burst(l, null);
      else if (!l.armed) { l.armed = true; this.events.push({ type: 'arm', x: nodeX(node), y: nodeY(node) }); }
      return;
    }
    const tx = nodeX(node), ty = nodeY(node);
    // 家のある辻には下げられない(家の前で待ち受けるのではなく、通りで仕留める)
    if (this.houses.some((h) => h.node === node)) { this.events.push({ type: 'deny', x: tx, y: ty }); return; }
    const hi = this.launchHouse(tx, ty);
    if (hi < 0 || this.lanterns.length >= this.P.maxLanterns) { this.events.push({ type: 'deny', x: tx, y: ty }); return; }
    const h = this.houses[hi];
    h.ammo--;
    const sy = h.y - 18;
    // 投げた向き(香・桂の「前」): 家から見て、縦横の大きい方
    const dc = nodeCol(node) - nodeCol(h.node), dr = nodeRow(node) - nodeRow(h.node);
    const fwd: [number, number] = Math.abs(dc) >= Math.abs(dr) ? [Math.sign(dc), 0] : [0, Math.sign(dr)];
    this.lanterns.push({ id: this.nextId++, node, sx: h.x, sy, x: h.x, y: sy, flying: true, flyT: 0, flyDur: this.flightTime(node), armed: false, age: 0, piece: h.piece, fwd });
    this.events.push({ type: 'launch', sx: h.x, sy, x: tx, y: ty, house: hi });
  }

  /** 提灯が弾ける。chain があれば誘爆(同じ連鎖として数える) */
  private burst(l: Lantern, chain: Chain | null) {
    const c = chain ?? this.newChain(l.x, l.y);
    const shape = pieceShape(l.piece, l.fwd, this.P);
    const c0 = nodeCol(l.node), r0 = nodeRow(l.node);
    const jumps = shape.jumps.filter(([dc, dr]) => c0 + dc >= 0 && c0 + dc < GRID.cols && r0 + dr >= 0 && r0 + dr < GRID.rows)
      .map(([dc, dr]) => ({ x: nodeX(nodeAt(c0 + dc, r0 + dr)), y: nodeY(nodeAt(c0 + dc, r0 + dr)) }));
    const range = Math.max(1, ...shape.rays.map((r) => r.len));
    this.blasts.push({ x: nodeX(l.node), y: nodeY(l.node), rays: shape.rays, jumps, range, ext: 0, hold: this.P.lightHold, shrinking: false, chain: c.id, big: true });
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

    this.spawn(dt);

    // 提灯: ゆっくり飛ぶ → 辻に下がる(罠)
    for (const l of [...this.lanterns]) {
      if (!l.flying) { l.age += dt; continue; }
      l.flyT += dt;
      const k = Math.min(1, l.flyT / l.flyDur);
      l.x = lerp(l.sx, nodeX(l.node), k); l.y = lerp(l.sy, nodeY(l.node), k);
      if (k >= 1) {
        l.flying = false; l.x = nodeX(l.node); l.y = nodeY(l.node);
        if (l.armed) { this.burst(l, null); continue; }
        this.events.push({ type: 'light', x: l.x, y: l.y });
      }
    }

    // 成仏したおばけ: 少しして小さく十字に弾ける
    for (const s of [...this.wisps]) {
      s.age += dt;
      if (s.age < P.wispDelay) continue;
      const c = this.chains.get(s.chain) ?? this.newChain(s.x, s.y);
      const rays: Ray[] = [];
      if (s.h) rays.push({ dc: 1, dr: 0, len: P.wispRange }, { dc: -1, dr: 0, len: P.wispRange });
      if (s.v) rays.push({ dc: 0, dr: 1, len: P.wispRange }, { dc: 0, dr: -1, len: P.wispRange });
      this.blasts.push({ x: s.x, y: s.y, rays, jumps: [], range: Math.max(0.01, P.wispRange), ext: 0, hold: P.lightHold * 0.5, shrinking: false, chain: c.id, big: false });
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
    if (g.lure) g.passed.push(g.lure);
    g.lure = 0; g.caught = 0;
  }

  private newChain(x: number, y: number): Chain {
    const c: Chain = { id: this.nextId++, count: 0, pts: 0, lx: x, ly: y };
    this.chains.set(c.id, c);
    return c;
  }

  /** 刻ごとの波。あの世の口から、数体ずつの群れを列にして放つ */
  private spawn(dt: number) {
    const P = this.P;
    for (const q of [...this.queue]) {
      if (q.at > this.t) continue;
      this.addGhost(q.kind, q.node);
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
    this.salvoT = Math.max(P.salvoGapMin, P.salvoGap - 0.2 * n) * (0.85 + this.rng.next() * 0.3);
    const kinds: GhostKind[] = ['fuwa'];
    if (n >= 1) kinds.push('zig');
    if (n >= 2) kinds.push('hop');
    if (n >= 3) kinds.push('kirai');
    const kind = this.rng.chance(0.35) ? 'fuwa' : this.rng.pick(kinds);
    const size = Math.min(this.waveLeft, this.rng.int(2, Math.min(5, 2 + Math.floor(n / 2))));
    const p = this.portals[this.portalTurn++ % this.portals.length];
    for (let i = 0; i < size; i++) this.queue.push({ at: this.t + i * P.convoyGap, kind: kind === 'kirai' && i > 0 ? 'fuwa' : kind, node: p.node });
    this.waveLeft -= size;
  }

  addGhost(kind: GhostKind, node: number) {
    const mult = { fuwa: 1, zig: 1.45, hop: 1, kirai: 0.85 }[kind];
    const g: Ghost = {
      id: this.nextId++, kind, x: nodeX(node), y: nodeY(node), from: node, to: node, prog: 0, dir: -1,
      prefH: this.rng.chance(0.5), speed: this.P.ghostSpeed * mult, target: Math.max(0, this.nearestLit(node)),
      age: 0, face: 1, lure: 0, caught: 0, haunt: false, passed: [], pause: 0, dead: false,
    };
    this.ghosts.push(g);
    this.events.push({ type: 'spawn', x: g.x, y: g.y, kind });
    return g;
  }

  /** おばけの今の行き先の辻(呼ばれている提灯、なければ家) */
  goalNode(g: Ghost): number {
    if (g.lure) { const l = this.lanterns.find((q) => q.id === g.lure); if (l) return l.node; }
    return this.houses[g.target].node;
  }

  /** 光嫌いが避ける辻(灯った提灯とその隣) */
  private shunned(n: number) {
    return this.lanterns.some((l) => !l.flying && gridDist(l.node, n) <= 1);
  }

  /** 辻で次の辻を決める。種類ごとに決まった曲がり方(読めるが、読み切るには頭を使う) */
  chooseNext(g: Ghost, n: number): { next: number; dir: number } | null {
    const goal = this.goalNode(g);
    const c = nodeCol(n), r = nodeRow(n), gc = nodeCol(goal), gr = nodeRow(goal);
    const dc = Math.sign(gc - c), dr = Math.sign(gr - r);
    const opts: number[] = [];
    if (dc) opts.push(dc > 0 ? 0 : 1);
    if (dr) opts.push(dr > 0 ? 2 : 3);
    const step = (d: number, k = 1) => {
      const nc = c + DIRS[d][0] * k, nr = r + DIRS[d][1] * k;
      return nc < 0 || nr < 0 || nc >= GRID.cols || nr >= GRID.rows ? -1 : nodeAt(nc, nr);
    };
    let d = -1;
    switch (g.kind) {
      case 'fuwa':
        // ふらふら: 縦横どちらも近づけるなら、辻ごとに交互(階段のように斜めに寄ってくる)
        if (opts.length === 2) { d = g.prefH ? opts[0] : opts[1]; g.prefH = !g.prefH; } else d = opts[0] ?? -1;
        break;
      case 'zig':
        // 鬼火: 速い。まっすぐ行けるうちは曲がらない(L 字に来る)
        d = opts.includes(g.dir) ? g.dir : (opts[0] ?? -1);
        break;
      case 'hop': {
        // 唐傘: 階段のように寄りつつ、辻を 1 つ飛ばして跳ぶ(跳び越した辻の罠にはかからない)
        if (opts.length === 2) { d = g.prefH ? opts[0] : opts[1]; g.prefH = !g.prefH; } else d = opts[0] ?? -1;
        if (d < 0) return null;
        const left = d < 2 ? Math.abs(gc - c) : Math.abs(gr - r);
        const two = step(d, 2);
        if (left >= 2 && two >= 0) return { next: two, dir: d };
        break;
      }
      case 'kirai': {
        // 影法師: 灯った提灯の近くの辻を避けて回り込む
        const ok = opts.filter((o) => { const m = step(o); return m >= 0 && !this.shunned(m); });
        if (ok.length) d = ok.length === 2 ? (g.prefH ? ok[0] : ok[1]) : ok[0];
        else {
          const back = g.dir < 0 ? -1 : g.dir ^ 1;
          const side = [0, 1, 2, 3].filter((o) => o !== back && !opts.includes(o)).filter((o) => { const m = step(o); return m >= 0 && !this.shunned(m); });
          d = side[0] ?? -1;
          if (d < 0) return null; // 囲まれた: その場で待つ
        }
        g.prefH = !g.prefH;
        break;
      }
    }
    if (d < 0) return null;
    const m = step(d);
    return m < 0 ? null : { next: m, dir: d };
  }

  /** 辻に着いた時: 罠・家・呼ばれる提灯を見て、次の辻を決める */
  private atNode(g: Ghost, n: number) {
    const P = this.P;
    g.from = n; g.to = n; g.prog = 0; g.x = nodeX(n); g.y = nodeY(n);
    // 罠: 呼ばれていた提灯の辻に着いたら、見とれて動けなくなる
    if (g.lure) {
      const l = this.lanterns.find((q) => q.id === g.lure);
      if (l && l.node === n && !l.flying) { g.caught = P.capture; this.events.push({ type: 'caught', x: g.x, y: g.y }); return; }
    }
    // 提灯がちょうどこの辻にあれば、呼ばれていなくてもかかる(唐傘が跳んで着いた時など)
    const here = this.lanterns.find((q) => q.node === n && !q.flying && !g.passed.includes(q.id));
    if (here && g.kind !== 'kirai') { g.lure = here.id; g.caught = P.capture; this.events.push({ type: 'caught', x: g.x, y: g.y }); return; }
    // 家
    const h = this.houses[g.target];
    if (!g.lure && h.lit && h.node === n) {
      g.haunt = true;
      if (h.haunt <= 0) { h.haunt = P.hauntTime; this.events.push({ type: 'haunt', x: h.x, y: h.y, house: g.target }); }
      return;
    }
    if (!g.lure && !h.lit) { const t = this.nearestLit(n); if (t >= 0) g.target = t; }
    // 呼ばれる: 灯った提灯が通りで近ければ、そちらへ向かう
    if (!g.lure && g.kind !== 'kirai') {
      let best = 0, bd = P.lureN + 0.5;
      for (const l of this.lanterns) {
        if (l.flying || g.passed.includes(l.id)) continue;
        const d = gridDist(l.node, n);
        if (d < bd) { bd = d; best = l.id; }
      }
      if (best) g.lure = best;
    }
    const nx = this.chooseNext(g, n);
    if (!nx) { g.pause = Math.max(g.pause, 0.3); return; }
    g.to = nx.next; g.dir = nx.dir;
    if (g.kind === 'hop') g.pause = P.hopPause;
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
        if (g.caught <= 0) { this.release(g); this.atNode(g, g.from); }
        continue;
      }
      if (g.pause > 0) { g.pause -= dt; continue; }
      if (g.from === g.to) { this.atNode(g, g.from); if (g.from === g.to || g.pause > 0) continue; }
      const len = Math.hypot(nodeX(g.to) - nodeX(g.from), nodeY(g.to) - nodeY(g.from));
      const sp = g.speed * ramp * (g.kind === 'hop' ? 2 : 1);
      g.prog += sp * dt;
      if (g.prog >= len) { this.atNode(g, g.to); continue; }
      const k = g.prog / len;
      const ox = g.x;
      g.x = lerp(nodeX(g.from), nodeX(g.to), k); g.y = lerp(nodeY(g.from), nodeY(g.to), k);
      if (Math.abs(g.x - ox) > 0.01) g.face = g.x < ox ? -1 : 1;
    }
  }

  /** 光が届いている所か(駒の筋の上、中心から ext 辻ぶん以内。桂は跳んだ先) */
  covers(b: Blast, x: number, y: number, r = 0) {
    if (Math.hypot(x - b.x, y - b.y) <= 16 + r) return true;
    for (const ray of b.rays) {
      const L = Math.min(ray.len, b.ext);
      if (L <= 0) continue;
      if (distToSeg(x, y, b.x, b.y, b.x + ray.dc * GRID.dx * L, b.y + ray.dr * GRID.dy * L) <= Math.max(1, r)) return true;
    }
    if (b.ext >= 1) for (const j of b.jumps) if (Math.hypot(x - j.x, y - j.y) <= 18 + r) return true;
    return false;
  }

  private runBlasts(dt: number) {
    const P = this.P;
    for (const b of [...this.blasts]) {
      if (!b.shrinking) {
        b.ext = Math.min(b.range, b.ext + P.lightSpeed * dt);
        if (b.ext >= b.range) { b.hold -= dt; if (b.hold <= 0) b.shrinking = true; }
      } else b.ext -= P.lightSpeed * 2 * dt;
      if (b.ext <= 0 && b.shrinking) { this.blasts = this.blasts.filter((q) => q !== b); continue; }
      const chain = this.chains.get(b.chain)!;
      // 誘爆: 光に触れた提灯も弾ける
      for (const l of [...this.lanterns]) {
        if (!l.flying && this.covers(b, l.x, l.y)) this.burst(l, chain);
      }
      for (const g of this.ghosts) {
        if (g.dead || !this.covers(b, g.x, g.y, GHOST_R)) continue;
        g.dead = true;
        chain.count++;
        const pts = P.basePts * chain.count;
        chain.pts += pts; this.score += pts; this.purified++;
        chain.lx = g.x; chain.ly = g.y;
        this.events.push({ type: 'purify', x: g.x, y: g.y, n: chain.count, pts, kind: g.kind });
        // 成仏したおばけは、自分のいる通りに沿って小さく弾ける(辻にいれば十字)
        const atNode = g.from === g.to || g.caught > 0 || g.haunt;
        const horiz = nodeRow(g.from) === nodeRow(g.to);
        if (this.wisps.length < 50) this.wisps.push({ id: this.nextId++, x: g.x, y: g.y, h: atNode || horiz, v: atNode || !horiz, age: 0, chain: chain.id });
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
/** 点 (x, y) と線分の距離 */
export function distToSeg(x: number, y: number, x0: number, y0: number, x1: number, y1: number) {
  const vx = x1 - x0, vy = y1 - y0, l2 = vx * vx + vy * vy;
  const k = l2 ? clamp(((x - x0) * vx + (y - y0) * vy) / l2, 0, 1) : 0;
  return Math.hypot(x - (x0 + vx * k), y - (y0 + vy * k));
}
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** タップの入力文字列 "x,y;x,y;" ⇔ 座標 */
export function encodeTaps(taps: Array<[number, number]>) { return taps.map(([x, y]) => `${Math.round(x)},${Math.round(y)};`).join(''); }
export function decodeTaps(s: string): Array<[number, number]> {
  return s.split(';').filter(Boolean).map((p) => { const [x, y] = p.split(',').map(Number); return [x, y] as [number, number]; });
}
