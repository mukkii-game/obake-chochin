// ゲームの中身(描画なし)。seed とタップの列だけで結果が決まる。
// Play シーンはこれを 1/60 秒刻みで step() し、state を絵にするだけ。
// bot(tools/sim.mjs)も同じものを描画なしで回す。
//
// ミサイルコマンド(時限・アナログな位置)× ボンバーマン(置いて少しして爆発・誘爆)× ギャラガ(編隊・輪):
//   - 投げる: 押した所へ、家から提灯がゆっくり飛び、着いて 3 秒後に弾ける(飛ぶ時間 + 3 秒を読む)。
//   - 光は家の形どおり: 縦の家 = 縦 / 横の家 = 横 / 丸い蔵 = 周り。提灯の形も同じ(縦長 / 横長 / 丸)。
//   - 光が、置かれた提灯の光の範囲に触れたら、その提灯もすぐ弾ける(誘爆)。つなぐために置く手もある。おばけどうしは連鎖しない。
//   - 置かれた提灯にたどり着いたおばけは見とれて止まり、後ろはつかえて詰まる(せき止め。弾けるまで)。
//   - おばけは決まった道筋で来る: 幽霊 = 縦・横・縦の階段 / 唐傘 = 斜めと縦のジグザグ / 鬼火 = 輪を描いてから突っ込む。
//   - 1 回の光と誘爆の n 体目は 基本点 × n。3 連以上は連鎖ボーナス、編隊を一度に全部倒すと編隊ボーナス。
//   - 弾は軒先の提灯。時間で少しずつ戻る。全 10 刻を越えればクリア。
// マス目は描画の目安だけ。位置はすべて px(アナログ)。
import { Rng } from '../core/rng';
import type { Params } from './params';
import { waveGroups, WAVE_COUNT, type Group } from './waves';

export const W = 960;
export const H = 540;
/** 巻物の紙の内側 */
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
const HOME_R = 6;
/** おばけの体の大きさ(光に触れたかの判定) */
export const GHOST_R = 13;
/** 大入道は大きい(力が減るほど小さくなる) */
export const ghostR = (g: { kind: GhostKind; hp: number }) => (g.kind === 'big' ? GHOST_R * (1 + 0.35 * g.hp) : g.kind === 'giant' ? GHOST_R * (1.6 + 0.3 * g.hp) : GHOST_R);

/**
 * おばけの動き(どれも途中で 1〜2 回だけ向きが変わる):
 *   幽霊 = 主に縦(降りる → 少し横 → 降りる)/ 唐傘 = 主に横(少し降りる → 長く横 → 降りる)/ 鬼火 = 輪(ギャラガ)/
 *   大入道 = 大きくてゆっくり、光 3 回で成仏 / 大大入道 = もっと大きくてもっとゆっくり、光 6 回
 */
export type GhostKind = 'fuwa' | 'kasa' | 'oni' | 'big' | 'giant';

/** 提灯の形 = 光の形 = 家の形 */
export type Piece = 'vline' | 'hline' | 'area' | 'up' | 'down' | 'cross';
export const PIECE_SETS: Record<string, Piece[]> = {
  '縦・横・丸': ['vline', 'hline', 'area'],
  '縦・横': ['vline', 'hline'],
  '上・下・丸': ['up', 'down', 'area'],
};

export interface Ghost {
  id: number; kind: GhostKind;
  x: number; y: number;
  /** 決まった道筋(点を順にたどる)と、いまの区間・その中の進み(px) */
  path: Array<[number, number]>; seg: number; segProg: number;
  speed: number; target: number; age: number; face: number;
  /** 編隊(一緒に出たもの)の番号 */
  form: number;
  /** 残りの力(大入道は 3。光 1 回ごとに 1 減って、小さくなる)と、当たった光 */
  hp: number; hitBy: number[];
  /** 止まっている(置かれた提灯に見とれている / 前がつかえている) */
  stopped: boolean;
  /** 置かれた提灯で見とれている */
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
  /** 着いてからの秒(fuse 秒で弾ける) */
  age: number;
}
export interface House { x: number; y: number; lit: boolean; ammo: number; regen: number; haunt: number; flash: number; piece: Piece }
/** 光。中心から形どおりに伸びる。ext = 伸びた長さ(px)。中心からの距離が [ext - 帯, ext] の所が光っている */
export interface Blast { id: number; x: number; y: number; piece: Piece; ext: number; chain: number }
export interface Chain { id: number; count: number; pts: number; lx: number; ly: number; forms: Map<number, number>; bursts: number }

export type GameEvent =
  | { type: 'launch'; sx: number; sy: number; x: number; y: number; house: number }
  | { type: 'select'; house: number }
  | { type: 'light'; x: number; y: number }
  | { type: 'deny'; x: number; y: number }
  | { type: 'break'; x: number; y: number; chained: boolean; n: number }
  | { type: 'caught'; x: number; y: number }
  | { type: 'hurt'; x: number; y: number; hp: number }
  | { type: 'purify'; x: number; y: number; n: number; pts: number; kind: GhostKind }
  | { type: 'chainEnd'; x: number; y: number; n: number; pts: number; bonus: number }
  | { type: 'formation'; x: number; y: number; size: number; bonus: number }
  | { type: 'haunt'; x: number; y: number; house: number }
  | { type: 'saved'; x: number; y: number; house: number }
  | { type: 'houseOut'; x: number; y: number; house: number; left: number }
  | { type: 'relight'; x: number; y: number; from: [number, number] }
  | { type: 'spawn'; x: number; y: number; kind: GhostKind }
  | { type: 'watch'; n: number }
  | { type: 'waveEnd'; n: number; bonus: number }
  | { type: 'clear' }
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
  formations = 0;
  over = false;
  /** 全 10 刻を越えた */
  cleared = false;
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
  private queue: Array<{ at: number; g: Group; form: number }> = [];
  private groups: Group[];
  /** 編隊ごとの数 */
  private formSize = new Map<number, number>();

  /** startWave: その刻から始める(刻ごとの確かめ用。tools/waves.mjs) */
  constructor(seed: number, readonly P: Params, startWave = 0) {
    this.rng = new Rng(seed);
    this.wave = startWave;
    this.pieces = PIECE_SETS[P.pieceSet] ?? PIECE_SETS['縦・横・丸'];
    // 家の形: どの形も必ず 1 軒はある。どこに建つかは毎回変わる
    const kinds: Piece[] = [...this.pieces];
    while (kinds.length < HOUSE_POS.length) kinds.push(this.rng.pick(this.pieces));
    for (let i = kinds.length - 1; i > 0; i--) { const j = this.rng.int(0, i); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    this.houses = HOUSE_POS.map(([x, y], i) => ({ x, y, lit: true, ammo: P.ammoPerHouse, regen: 0, haunt: 0, flash: 0, piece: kinds[i] }));
    this.groups = waveGroups(startWave, this.rng);
  }

  get litCount() { return this.houses.filter((h) => h.lit).length; }
  get ammo() { return this.houses.reduce((s, h) => s + (h.lit ? h.ammo : 0), 0); }
  get waveCount() { return WAVE_COUNT; }
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

  /** 1 タップ。家 → その家を選ぶ(もう一度で外す・他の家で切り替え)/ それ以外 → 選んだ家(無ければ一番近い家)から、押した所へ投げる */
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
    const from = this.selected >= 0 && this.canThrow(this.selected) ? this.selected : this.launchHouse(x, y);
    if (from < 0 || this.lanterns.length >= this.P.maxLanterns || this.lanterns.some((q) => Math.hypot(q.tx - x, q.ty - y) < this.P.grabR)) {
      this.events.push({ type: 'deny', x, y }); return;
    }
    const h = this.houses[from];
    h.ammo--;
    // 選んだ家はそのまま(続けてその家から投げられる)。外れるのは、同じ家をもう一度押す・他の家を押す・弾が無くなった時
    const sy = h.y - 14;
    this.lanterns.push({ id: this.nextId++, piece: h.piece, tx: x, ty: y, sx: h.x, sy, x: h.x, y: sy, flying: true, flyT: 0, flyDur: this.flightTime(x, y, from), age: 0 });
    this.events.push({ type: 'launch', sx: h.x, sy, x, y, house: from });
  }

  /** 光の形の長さ(中心から。丸は半径) */
  reach(piece: Piece) { return piece === 'area' ? this.P.areaReach : piece === 'cross' ? this.P.lineReach * 0.7 : this.P.lineReach; }
  /** 光の帯の長さ(px)。どの所も同じ間(light.hold 秒)だけ照らされる */
  get band() { return Math.max(10, this.P.lightHold * this.P.lightSpeed); }

  /** 点 (x, y) が、光の形の中の「中心から何 px の所」にあるか(形の外なら -1)。r = 当たりの余裕(体の大きさ) */
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

  /** 光の形の上の代表点(連爆の判定と、つながりの表示に使う) */
  shapePoints(piece: Piece, x: number, y: number): Array<[number, number]> {
    const L = this.reach(piece), w = this.P.lightWidth / 2;
    const pts: Array<[number, number]> = [[x, y]];
    const line = (dx: number, dy: number) => {
      for (const k of [0.25, 0.5, 0.75, 1]) for (const o of [-w, 0, w]) pts.push([x + dx * L * k + dy * o, y + dy * L * k + dx * o]);
    };
    switch (piece) {
      case 'vline': line(0, -1); line(0, 1); break;
      case 'hline': line(-1, 0); line(1, 0); break;
      case 'up': line(0, -1); break;
      case 'down': line(0, 1); break;
      case 'cross': line(0, -1); line(0, 1); line(-1, 0); line(1, 0); break;
      case 'area': for (let a = 0; a < 16; a++) for (const k of [0.5, 1]) pts.push([x + Math.cos((a * Math.PI) / 8) * L * k, y + Math.sin((a * Math.PI) / 8) * L * k]); break;
    }
    return pts;
  }

  /** 2 つの提灯の光の形が重なるか(= 片方が弾ければ、もう片方も連爆する) */
  touches(a: { piece: Piece; tx: number; ty: number }, b: { piece: Piece; tx: number; ty: number }) {
    if (Math.hypot(a.tx - b.tx, a.ty - b.ty) > this.reach(a.piece) + this.reach(b.piece) + this.P.lightWidth) return false;
    return this.shapePoints(b.piece, b.tx, b.ty).some(([x, y]) => this.along(a.piece, a.tx, a.ty, x, y, 2) >= 0)
      || this.shapePoints(a.piece, a.tx, a.ty).some(([x, y]) => this.along(b.piece, b.tx, b.ty, x, y, 2) >= 0);
  }

  /** 光がいま (x, y) を照らしているか */
  lit(b: Blast, x: number, y: number, r = 0) {
    const a = this.along(b.piece, b.x, b.y, x, y, r);
    return a >= 0 && a <= b.ext && a >= b.ext - this.band;
  }

  /** 提灯が弾ける。chain があれば誘爆(同じ連鎖として数える) */
  private burst(l: Lantern, chain: Chain | null) {
    const c = chain ?? this.newChain(l.tx, l.ty);
    this.blasts.push({ id: this.nextId++, x: l.tx, y: l.ty, piece: l.piece, ext: 0, chain: c.id });
    this.lanterns = this.lanterns.filter((q) => q !== l);
    c.bursts++;
    this.events.push({ type: 'break', x: l.tx, y: l.ty, chained: !!chain, n: c.bursts });
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
        if (l.age >= P.fuse) this.burst(l, null); // 置いて fuse 秒で弾ける(ボンバーマン)
        continue;
      }
      l.flyT += dt;
      const k = Math.min(1, l.flyT / l.flyDur);
      l.x = lerp(l.sx, l.tx, k); l.y = lerp(l.sy, l.ty, k);
      if (k >= 1) { l.flying = false; this.events.push({ type: 'light', x: l.x, y: l.y }); }
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

    if (this.litCount === 0 && !this.over) { this.over = true; this.events.push({ type: 'over' }); }
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
    const c: Chain = { id: this.nextId++, count: 0, pts: 0, lx: x, ly: y, forms: new Map(), bursts: 0 };
    this.chains.set(c.id, c);
    return c;
  }

  private spawn(dt: number) {
    const P = this.P;
    for (const q of [...this.queue]) {
      if (q.at > this.t) continue;
      this.queue = this.queue.filter((o) => o !== q);
      for (const c of q.g.cols) this.addGhost(q.g, colX(c), q.form);
    }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        if (this.begun) this.wave++;
        this.begun = true;
        this.events.push({ type: 'watch', n: this.wave });
        for (const g of this.groups) {
          const form = this.nextId++;
          this.formSize.set(form, g.n * g.cols.length);
          for (let i = 0; i < g.n; i++) this.queue.push({ at: this.t + g.t + i * g.gap, g, form });
        }
      }
      return;
    }
    if (!this.queue.length && !this.ghosts.length && !this.blasts.length && this.houses.every((h) => h.haunt <= 0)) {
      const bonus = this.litCount * P.waveBonus * (this.wave + 1);
      this.score += bonus;
      this.events.push({ type: 'waveEnd', n: this.wave, bonus });
      if (this.wave + 1 >= this.waveCount) { this.cleared = true; this.over = true; this.events.push({ type: 'clear' }); return; }
      this.pause = WAVE_PAUSE;
      this.groups = waveGroups(this.wave + 1, this.rng);
    }
  }

  addGhost(gr: Group, x: number, form = 0) {
    const kind = gr.kind;
    const mult = { fuwa: 1, kasa: 1.1, oni: 1.3, big: 0.65, giant: 0.45 }[kind];
    const y = SPAWN_Y;
    let target = gr.to !== undefined && this.houses[gr.to]?.lit ? gr.to : this.nearestLit(x, y);
    if (target < 0) target = 0;
    const g: Ghost = {
      id: this.nextId++, kind, x, y, path: [], seg: 0, segProg: 0,
      speed: this.P.ghostSpeed * mult, target, age: 0, face: 1, form, hp: kind === 'big' ? this.P.bigHp : kind === 'giant' ? this.P.giantHp : 1, hitBy: [], stopped: false, caught: false, haunt: false, dead: false,
    };
    g.path = this.makePath(kind, x, y, this.houses[target], gr.side ?? 1, gr.turn ?? (kind === 'kasa' ? 0.28 : 0.45));
    this.ghosts.push(g);
    this.events.push({ type: 'spawn', x, y, kind });
    return g;
  }

  /**
   * おばけの決まった道筋(動き方の決まりはここだけ。先読みも同じ道をたどる)
   *   幽霊 = 縦に降り、turn の高さで横へ渡り、また縦に降りる(真上なら縦だけ)
   *   唐傘 = 斜め 45° と縦を交互に。家への線のまわりを左右に振れる
   *   鬼火 = 斜めに降りて、途中で輪を 1 周描き(ギャラガ)、家へ突っ込む
   */
  makePath(kind: GhostKind, sx: number, sy: number, h: { x: number; y: number }, side: number, turn: number): Array<[number, number]> {
    const P = this.P;
    const pts: Array<[number, number]> = [[sx, sy]];
    const top = Math.max(sy, PLAY.y0);
    if (kind !== 'oni') {
      // 縦 → 横 → 縦(向きが変わるのは 2 回だけ)。幽霊・大入道は横が短く(主に縦)、唐傘は出口が遠く横が長い(主に横)
      if (Math.abs(h.x - sx) > 4) {
        const ty = top + (h.y - 40 - top) * turn;
        pts.push([sx, ty], [h.x, ty]);
      }
    } else {
      // 輪: 中心は出口と家の間の上の方
      const R = P.loopR;
      const cx = clamp(sx + (h.x - sx) * 0.45, PLAY.x0 + R + 10, PLAY.x1 - R - 10), cy = top + (h.y - top) * 0.38;
      const a0 = side > 0 ? Math.PI : 0;
      for (let k = 0; k <= 24; k++) {
        const a = a0 + side * (k / 24) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * R, cy - Math.sin(a) * R]);
      }
    }
    pts.push([h.x, h.y]);
    return pts;
  }

  /** 道筋を dist px 進める */
  advance(g: Ghost, dist: number) {
    const ox = g.x;
    let left = dist;
    while (left > 0 && g.seg < g.path.length - 1) {
      const [ax, ay] = g.path[g.seg], [bx, by] = g.path[g.seg + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const st = Math.min(left, len - g.segProg);
      g.segProg += st; left -= st;
      const k = len > 0 ? g.segProg / len : 1;
      g.x = ax + (bx - ax) * k; g.y = ay + (by - ay) * k;
      if (g.segProg >= len - 1e-6) { g.seg++; g.segProg = 0; }
    }
    if (Math.abs(g.x - ox) > 0.01) g.face = g.x < ox ? -1 : 1;
  }

  /** 行き先の家が消えた: いまの所から、近い灯りの家へ階段の道筋で向かい直す */
  private retarget(g: Ghost) {
    const t = this.nearestLit(g.x, g.y);
    if (t < 0) return;
    g.target = t;
    const h = this.houses[t];
    g.path = [[g.x, g.y], [g.x, Math.max(g.y, h.y - 40)], [h.x, Math.max(g.y, h.y - 40)], [h.x, h.y]];
    g.seg = 0; g.segProg = 0;
  }

  /**
   * おばけを動かす。置かれた提灯に着いたおばけは見とれて止まる(弾けるまで)。
   * 止まったおばけのすぐ手前まで来たおばけは、つかえて止まる(せき止め)。前が動けばまた進む
   */
  private moveGhosts(dt: number) {
    const P = this.P;
    const placed = this.lanterns.filter((l) => !l.flying);
    for (const g of this.ghosts) {
      if (g.dead) continue;
      g.age += dt;
      if (g.haunt) continue;
      if (!this.houses[g.target].lit) this.retarget(g);
      if (placed.some((l) => Math.hypot(l.tx - g.x, l.ty - g.y) < P.catchR)) {
        if (!g.caught) { g.caught = true; this.events.push({ type: 'caught', x: g.x, y: g.y }); }
        g.stopped = true;
        continue;
      }
      g.caught = false;
      const c: Ghost = { ...g };
      this.advance(c, g.speed * dt);
      const vx = c.x - g.x, vy = c.y - g.y;
      const blocked = this.ghosts.some((o) => o !== g && !o.dead && o.stopped && !o.haunt
        && Math.hypot(o.x - c.x, o.y - c.y) < P.queueGap && (o.x - g.x) * vx + (o.y - g.y) * vy > 0);
      if (blocked) { g.stopped = true; continue; }
      Object.assign(g, c);
      g.stopped = false; // c は止まる前の写しなので、写した後で戻す(写す前に戻すと、止まったままの印が残る)
      const h = this.houses[g.target];
      if (h.lit && g.seg >= g.path.length - 1 && Math.hypot(h.x - g.x, h.y - g.y) < HOME_R) {
        g.haunt = true; g.x = h.x; g.y = h.y;
        if (h.haunt <= 0) { h.haunt = P.hauntTime; this.events.push({ type: 'haunt', x: h.x, y: h.y, house: g.target }); }
      }
    }
  }

  /** 先読み: このおばけが step 秒ごとにいる所(止まらないとして) */
  predict(g: Ghost, horizon: number, step = 0.25): Array<{ x: number; y: number; t: number }> {
    const c: Ghost = { ...g };
    const out: Array<{ x: number; y: number; t: number }> = [];
    for (let t = 0; t <= horizon; t += step) {
      out.push({ x: c.x, y: c.y, t });
      if (g.haunt || g.stopped || c.seg >= c.path.length - 1) break;
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
      // 誘爆: 光が届いた提灯は、すぐ弾ける(置かれたものだけ。飛んでいるものは除く)
      // 連爆は、光がその提灯の光の範囲に触れるだけで起きる(提灯そのものに当たらなくてよい)
      for (const l of [...this.lanterns]) if (!l.flying && this.shapePoints(l.piece, l.tx, l.ty).some(([x, y]) => this.lit(b, x, y, 4))) this.burst(l, chain);
      for (const g of this.ghosts) {
        if (g.dead || g.y < PLAY.y0 || g.hitBy.includes(b.id) || !this.lit(b, g.x, g.y, ghostR(g))) continue;
        g.hitBy.push(b.id);
        if (--g.hp > 0) { this.events.push({ type: 'hurt', x: g.x, y: g.y, hp: g.hp }); continue; }
        g.dead = true;
        chain.count++;
        chain.forms.set(g.form, (chain.forms.get(g.form) ?? 0) + 1);
        const pts = P.basePts * chain.count * (g.kind === 'big' ? P.bigPts : g.kind === 'giant' ? P.giantPts : 1);
        chain.pts += pts; this.score += pts; this.purified++;
        chain.lx = g.x; chain.ly = g.y;
        this.events.push({ type: 'purify', x: g.x, y: g.y, n: chain.count, pts, kind: g.kind });
      }
    }
  }

  /** 光が残っていない連鎖を締める: 連鎖ボーナス・編隊ボーナス、大連鎖なら家の灯りを戻す */
  private closeChains() {
    const alive = new Set<number>();
    for (const b of this.blasts) alive.add(b.chain);
    for (const c of [...this.chains.values()]) {
      if (alive.has(c.id)) continue;
      this.chains.delete(c.id);
      if (c.count === 0) continue;
      this.bestChain = Math.max(this.bestChain, c.count);
      const last: [number, number] = [c.lx, c.ly];
      const bonus = c.count >= 3 ? this.P.chainBonus * (c.count - 2) * (c.count - 2) : 0;
      this.score += bonus;
      this.events.push({ type: 'chainEnd', x: last[0], y: last[1], n: c.count, pts: c.pts, bonus });
      // 編隊を一度の光(と誘爆)で全部倒した
      for (const [form, k] of c.forms) {
        const size = this.formSize.get(form) ?? 0;
        if (size >= 3 && k >= size) {
          const fb = this.P.formBonus * size * (this.wave + 1);
          this.score += fb; this.formations++;
          this.events.push({ type: 'formation', x: last[0], y: last[1], size, bonus: fb });
        }
      }
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
