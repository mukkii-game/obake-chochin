// ウェーブごとのおばけの出方(3 日 × 3 ウェーブ = 全 9 ウェーブでクリア)。1 刻目は型を 1 つだけ、2 刻目からは型を重ねて忙しくする。
// 説明の文字は出さない。出方そのものが「こういう時はこう」を教える。
//
// 型(と、その答えの一例)。どのおばけも途中で 1〜2 回だけ向きが変わる:
//   一列     … 幽霊が縦に並んで降りてくる → 縦の家の提灯を列の中ほどへ
//   横並び   … 幽霊が横に並んで降りてくる → 横の家の提灯を並んだ高さへ。端まで届かなければ 2 つ置いて誘爆
//   段       … 幽霊が降りて、少し横へ、また降りる → 横へ動く所を横で、降りる所を縦で
//   横渡り   … 唐傘が端から出て、長く横へ渡る → 渡る高さに横で
//   交差     … 唐傘が左右から渡ってきて真ん中ですれ違う → すれ違う所と時に丸で
//   輪       … 鬼火が輪を描いてから突っ込む(ギャラガ)→ 輪の真ん中に丸
//   大入道   … 大きくてゆっくり、光 3 回(大大入道は 6 回)で成仏 → 誘爆で何度も光を当てる。止めて重ねる
//   せき止め … 間をあけて長く続く → 先頭の前に置いて止め、詰まった所を縦で(置いた提灯は 3 秒後に弾ける)
import type { GhostKind } from './logic';
import type { Rng } from '../core/rng';

export interface Group {
  /** 刻が始まってからの秒 */
  t: number;
  kind: GhostKind;
  /** 出てくる列(0-12)。複数なら横に並んで同時に出る(1 つの編隊) */
  cols: number[];
  /** 何回出るか(列なら縦に並ぶ) */
  n: number;
  /** 出る間(秒) */
  gap: number;
  /** 向かう家(0-5、左から)。省略で一番近い家 */
  to?: number;
  /** ジグザグの最初の向き・輪の回る向き(±1) */
  side?: number;
  /** 階段: 横へ渡る高さ(0 = 上の端、1 = 家の高さ)。edge の時は入ってくる高さ */
  turn?: number;
  /** 横から入ってくる(-1 = 左の端から、1 = 右の端から)。横一列に渡ってくるので、横の提灯で一網打尽 */
  edge?: number;
  /** 集まる所の x(px)。あれば、いったんこの縦の筋に集まってから家へ降りる */
  via?: number;
  /** 集まる点の y(px)。via と両方あれば、その 1 点にみんな集まる(丸の提灯で) */
  viaY?: number;
  /** 集まる横の筋の y(px)。この高さで横に長く渡ってから家へ(横の提灯で) */
  viaRow?: number;
  /** 行進(インベーダー): 端から端へ渡っては 1 段ずつ下がる(edge と一緒に使う) */
  march?: boolean;
}

type Pattern = (m: boolean) => Group[];
/** m = 左右を入れ替える */
const X = (c: number, m: boolean) => (m ? 12 - c : c);
const T = (h: number, m: boolean) => (m ? 5 - h : h);

export const PATTERNS: Record<string, Pattern> = {
  // 幽霊(主に縦)
  line: (m) => [{ t: 0, kind: 'fuwa', cols: [X(5, m)], n: 5, gap: 0.9, to: T(2, m) }],
  row: (m) => [{ t: 0, kind: 'fuwa', cols: [X(3, m), X(4, m), X(5, m), X(6, m), X(7, m)], n: 1, gap: 0, to: T(2, m), turn: 0.6 }],
  step: (m) => [{ t: 0, kind: 'fuwa', cols: [X(4, m)], n: 4, gap: 0.9, to: T(3, m), turn: 0.5 }],
  dam: (m) => [{ t: 0, kind: 'fuwa', cols: [X(10, m)], n: 7, gap: 1.3, to: T(5, m) }],
  // 唐傘(主に横): 端から出て、少し降りて長く横へ渡り、家の上で降りる
  sweep: (m) => [{ t: 0, kind: 'kasa', cols: [X(0, m)], n: 4, gap: 0.8, to: T(4, m), turn: 0.3 }],
  cross: (m) => [
    { t: 0, kind: 'kasa', cols: [X(0, m)], n: 3, gap: 0.8, to: T(4, m), turn: 0.35 },
    { t: 0, kind: 'kasa', cols: [X(12, m)], n: 3, gap: 0.8, to: T(1, m), turn: 0.35 },
  ],
  // 横から(左右の端から横一列に渡ってくる → 横の提灯を並んだ高さへ)
  sideL: (m) => [{ t: 0, kind: 'fuwa', cols: [0], n: 3, gap: 0.6, to: T(3, m), edge: m ? 1 : -1, turn: 0.45 }],
  sideK: (m) => [{ t: 0, kind: 'kasa', cols: [0], n: 3, gap: 0.6, to: T(1, m), edge: m ? -1 : 1, turn: 0.3 }],
  sides: (m) => [
    { t: 0, kind: 'fuwa', cols: [0], n: 3, gap: 0.6, to: T(4, m), edge: m ? 1 : -1, turn: 0.3 },
    { t: 0.5, kind: 'fuwa', cols: [0], n: 3, gap: 0.6, to: T(1, m), edge: m ? -1 : 1, turn: 0.6 },
  ],
  // 鬼火(輪)
  loop: (m) => [{ t: 0, kind: 'oni', cols: [X(2, m)], n: 5, gap: 0.6, to: T(3, m), side: m ? -1 : 1 }],
  // 大入道・大大入道(主に縦、ゆっくり、何度も光を当てる)
  big: (m) => [{ t: 0, kind: 'big', cols: [X(6, m)], n: 1, gap: 0, to: T(2, m), turn: 0.5 }],
  // 特大入道: ときどき来る、いちばん大きな敵(ゆっくり、力 12)。お供のざこと一緒に
  mega: (m) => [
    { t: 0, kind: 'mega', cols: [X(6, m)], n: 1, gap: 0, to: T(2, m), turn: 0.5 },
    { t: 2, kind: 'fuwa', cols: [X(3, m), X(9, m)], n: 3, gap: 0.9, to: T(2, m), turn: 0.5 },
  ],
  giant: (m) => [{ t: 0, kind: 'giant', cols: [X(7, m)], n: 1, gap: 0, to: T(3, m), turn: 0.5 }],
};

const P = PATTERNS;
function shift(gs: Group[], dt: number): Group[] { return gs.map((g) => ({ ...g, t: g.t + dt })); }
/** 数を減らした型(1・2 刻目の顔見世用) */
function few(gs: Group[], n: number): Group[] { return gs.map((g) => ({ ...g, n: Math.min(g.n, n) })); }


/** 1 日 = 最大 3 ウェーブ。8/13(迎え盆)・8/14・8/15(お盆)の 3 日を凌げばクリア */
export const WAVES_PER_DAY = 3;
export const DAYS = 3;

// 足りない型(はやて・行進・お供つきの大入道)
const Q: Record<string, Pattern> = {
  kazeLine: (m) => [{ t: 0, kind: 'kaze', cols: [X(3, m)], n: 5, gap: 0.7, to: T(1, m), turn: 0.5 }],
  kazeSide: (m) => [{ t: 0, kind: 'kaze', cols: [0], n: 3, gap: 0.45, to: T(4, m), edge: m ? 1 : -1, turn: 0.4 }],
  kazeRow: (m) => [{ t: 0, kind: 'kaze', cols: [X(6, m), X(7, m), X(8, m)], n: 1, gap: 0, to: T(3, m), turn: 0.5 }],
  // いなずま: すごく速いが、斜めと横に曲がりながら長く走ってから家へ
  // 3 体以上が詰めて同じ道を走る(まとめて倒せる)
  zig: (m) => [{ t: 0, kind: 'inazuma', cols: [X(2, m)], n: 3, gap: 0.45, to: T(3, m), side: m ? -1 : 1 }],
  marchL: (m) => [{ t: 0, kind: 'fuwa', cols: [0], n: 6, gap: 0.8, to: T(2, m), edge: m ? 1 : -1, turn: 0.1, march: true }],
  marchK: (m) => [{ t: 0, kind: 'kasa', cols: [0], n: 5, gap: 0.75, to: T(4, m), edge: m ? -1 : 1, turn: 0.15, march: true }],
  // お供つきの大入道: 幽霊の群れが大入道のまわりを一緒に来る → まとめてコンボで(コンボほど力が上がり、大入道に効く)
  escort: (m) => [
    { t: 0, kind: 'big', cols: [X(6, m)], n: 1, gap: 0, to: T(2, m), turn: 0.5 },
    { t: 0.6, kind: 'fuwa', cols: [X(4, m), X(8, m)], n: 3, gap: 0.8, to: T(2, m), turn: 0.5 },
  ],
  giantEscort: (m) => [
    { t: 0, kind: 'giant', cols: [X(7, m)], n: 1, gap: 0, to: T(3, m), turn: 0.5 },
    { t: 1, kind: 'fuwa', cols: [X(5, m), X(9, m)], n: 3, gap: 0.9, to: T(3, m), turn: 0.5 },
  ],
};

/** ウェーブごとの題(日のはじめの札・ウェーブの札に出す)。何を練習するウェーブかをはっきりさせる */
export const WAVE_NAMES: Array<{ ja: string; en: string }> = [
  { ja: '幽霊の行列', en: 'Ghost Parade' },
  { ja: '唐傘の横渡り', en: 'Umbrellas Cross' },
  { ja: '鬼火の輪と大入道', en: 'Wisps and a Big One' },
  { ja: 'はやて', en: 'Gale' },
  { ja: 'おばけの行進', en: 'The March' },
  { ja: '大入道とざこたち', en: 'Big One and Friends' },
  { ja: 'はさみうち', en: 'Pincer' },
  { ja: '大入道まつり', en: 'Big Festival' },
  { ja: '総力戦!', en: 'ALL OUT!' },
];

const WAVES: Group[][] = [
  // 8/13 迎え盆: 1 種類ずつ顔見世(縦の幽霊 → 横の唐傘 → 輪と大入道)
  [...few(P.line(false), 4), ...shift(few(P.row(false), 1).map((g) => ({ ...g, cols: g.cols.slice(1, 4) })), 5), ...shift(few(P.line(true), 3), 9), ...shift(P.big(false), 13)],
  [...few(P.sweep(false), 3), ...shift(P.sideK(false), 4), ...shift(P.sideL(true), 9), ...shift(Q.zig(false), 12)],
  [...P.loop(false), ...shift(P.big(true), 3), ...shift(P.sideL(false), 8), ...shift(few(P.step(false), 3), 11)],
  // 8/14: はやて(先読み)→ 行進(横の提灯)→ 大入道とお供(コンボ)
  [...Q.kazeLine(false), ...shift(Q.kazeSide(true), 5), ...shift(Q.kazeRow(false), 10), ...shift(few(P.line(true), 3), 12), ...shift(Q.kazeSide(false), 14), ...shift(P.big(true), 7)],
  [...Q.marchL(false), ...shift(P.big(false), 3), ...shift(Q.zig(true), 5), ...shift(Q.marchK(true), 7), ...shift(P.sideL(false), 11), ...shift(Q.escort(true), 13)],
  [...Q.escort(false), ...shift(Q.escort(true), 7), ...shift(few(P.loop(false), 3), 12), ...shift(P.big(false), 10), ...shift(P.mega(true), 15)],
  // 8/15 お盆: はさみうち → 大入道まつり → 総力戦(ぜんぶ出る)
  [...P.sides(false), ...shift(Q.marchL(true), 4), ...shift(Q.zig(false), 7), ...shift(Q.kazeSide(false), 10), ...shift(Q.escort(true), 6), ...shift(P.giant(false), 12)],
  [...Q.giantEscort(false), ...shift(Q.escort(true), 5), ...shift(Q.kazeLine(false), 8), ...shift(P.big(false), 10), ...shift(P.mega(false), 13), ...shift(P.giant(true), 16)],
  [...P.line(false), ...shift(P.loop(true), 2), ...shift(P.sides(false), 5), ...shift(Q.kazeRow(true), 8), ...shift(Q.marchK(false), 10),
    ...shift(Q.escort(false), 12), ...shift(P.cross(false), 17), ...shift(P.giant(false), 20), ...shift(Q.kazeSide(true), 22), ...shift(Q.zig(true), 15), ...shift(P.mega(false), 24), ...shift(P.big(true), 6), ...shift(P.giant(true), 14)],
];
export const WAVE_COUNT = WAVES.length;
/** n ウェーブ目が何日目か(0 = 8/13)と、その日の何番目か */
export const dayOf = (n: number) => Math.floor(n / WAVES_PER_DAY);
export const waveInDay = (n: number) => n % WAVES_PER_DAY;
export const OPENING_WAVES = WAVES.length;

/** n 刻目の出方(10 刻より先は、型を混ぜて毎回変わる。いまは 10 刻でクリア) */
export function waveGroups(n: number, rng: Rng): Group[] {
  if (n < WAVES.length) {
    // 2・3 日目は、刻ごとに決まった縦の筋へみんなが集まってから家へ(狙ってまとめて倒しやすく、家までの道も長く)
    // 3 日目は第一・第二刻だけ集まりを弱める(筋に寄らない組を混ぜる)代わりに、総力戦は少し軽く
    // 2・3 日目は、刻ごとに決まった縦の筋へいったん集まってから家へ(やりすぎないよう、3 日目の第一・第二刻は半分の組だけ)
    const via = n >= WAVES_PER_DAY ? [300, 480, 660][n % 3] : undefined;
    return WAVES[n].map((g, k) => ({ ...g, via: n >= 2 * WAVES_PER_DAY && n < WAVES.length - 1 && k % 2 ? undefined : via }));
  }
  const keys = Object.keys(PATTERNS);
  const out: Group[] = [];
  let t = 0;
  for (let i = 0; i < 5; i++) { out.push(...shift(PATTERNS[rng.pick(keys)](rng.chance(0.5)), t)); t += 3 + rng.next() * 3; }
  return out;
}
