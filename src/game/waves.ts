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
}

type Pattern = (m: boolean) => Group[];
/** m = 左右を入れ替える */
const X = (c: number, m: boolean) => (m ? 12 - c : c);
const T = (h: number, m: boolean) => (m ? 5 - h : h);

export const PATTERNS: Record<string, Pattern> = {
  // 幽霊(主に縦)
  line: (m) => [{ t: 0, kind: 'fuwa', cols: [X(5, m)], n: 5, gap: 1.5, to: T(2, m) }],
  row: (m) => [{ t: 0, kind: 'fuwa', cols: [X(3, m), X(4, m), X(5, m), X(6, m), X(7, m)], n: 1, gap: 0, to: T(2, m), turn: 0.6 }],
  step: (m) => [{ t: 0, kind: 'fuwa', cols: [X(4, m)], n: 4, gap: 1.5, to: T(3, m), turn: 0.5 }],
  dam: (m) => [{ t: 0, kind: 'fuwa', cols: [X(10, m)], n: 7, gap: 2.2, to: T(5, m) }],
  // 唐傘(主に横): 端から出て、少し降りて長く横へ渡り、家の上で降りる
  sweep: (m) => [{ t: 0, kind: 'kasa', cols: [X(0, m)], n: 4, gap: 1.3, to: T(4, m), turn: 0.3 }],
  cross: (m) => [
    { t: 0, kind: 'kasa', cols: [X(0, m)], n: 3, gap: 1.3, to: T(4, m), turn: 0.35 },
    { t: 0, kind: 'kasa', cols: [X(12, m)], n: 3, gap: 1.3, to: T(1, m), turn: 0.35 },
  ],
  // 横から(左右の端から横一列に渡ってくる → 横の提灯を並んだ高さへ)
  sideL: (m) => [{ t: 0, kind: 'fuwa', cols: [0], n: 4, gap: 1.0, to: T(3, m), edge: m ? 1 : -1, turn: 0.45 }],
  sideK: (m) => [{ t: 0, kind: 'kasa', cols: [0], n: 4, gap: 0.9, to: T(1, m), edge: m ? -1 : 1, turn: 0.3 }],
  sides: (m) => [
    { t: 0, kind: 'fuwa', cols: [0], n: 3, gap: 1.0, to: T(4, m), edge: m ? 1 : -1, turn: 0.3 },
    { t: 0.5, kind: 'fuwa', cols: [0], n: 3, gap: 1.0, to: T(1, m), edge: m ? -1 : 1, turn: 0.6 },
  ],
  // 鬼火(輪)
  loop: (m) => [{ t: 0, kind: 'oni', cols: [X(2, m)], n: 5, gap: 0.9, to: T(3, m), side: m ? -1 : 1 }],
  // 大入道・大大入道(主に縦、ゆっくり、何度も光を当てる)
  big: (m) => [{ t: 0, kind: 'big', cols: [X(6, m)], n: 1, gap: 0, to: T(2, m), turn: 0.5 }],
  giant: (m) => [{ t: 0, kind: 'giant', cols: [X(7, m)], n: 1, gap: 0, to: T(3, m), turn: 0.5 }],
};

const P = PATTERNS;
function shift(gs: Group[], dt: number): Group[] { return gs.map((g) => ({ ...g, t: g.t + dt })); }
/** 数を減らした型(1・2 刻目の顔見世用) */
function few(gs: Group[], n: number): Group[] { return gs.map((g) => ({ ...g, n: Math.min(g.n, n) })); }

/** 旧 10 刻の出方(このうち 9 つを 3 日 × 3 ウェーブに並べる) */
const OLD: Group[][] = [
  [...few(P.line(false), 3), ...shift(few(P.sweep(true), 2), 3), ...shift(few(P.loop(false), 3), 6), ...shift(P.big(false), 8)],
  [...few(P.row(false), 1).map((g) => ({ ...g, cols: g.cols.slice(1, 4) })), ...shift(few(P.cross(false), 2), 3), ...shift(P.big(true), 5)],
  [...P.step(false), ...shift(P.sweep(true), 4), ...shift(P.giant(false), 5)],
  [...P.sweep(false), ...shift(P.sweep(true), 3), ...shift(P.line(false), 7), ...shift(P.big(false), 4)],
  [...P.loop(false), ...shift(P.row(true), 6), ...shift(P.big(true), 3), ...shift(P.big(false), 10)],
  [...P.dam(false), ...shift(P.sweep(true), 4), ...shift(P.step(true), 10), ...shift(P.giant(true), 6)],
  [...P.loop(false), ...shift(P.loop(true), 5), ...shift(P.cross(false), 10), ...shift(P.big(false), 7)],
  [...P.row(false), ...shift(P.row(true), 4), ...shift(P.sweep(false), 8), ...shift(P.line(true), 12), ...shift(P.big(true), 2), ...shift(P.giant(false), 9)],
  [...P.cross(false), ...shift(P.loop(true), 3), ...shift(P.dam(false), 6), ...shift(P.step(true), 11), ...shift(P.big(false), 1), ...shift(P.big(true), 9)],
  [...P.loop(false), ...shift(P.row(true), 3), ...shift(P.sweep(false), 6), ...shift(P.cross(true), 9), ...shift(P.loop(true), 13), ...shift(P.giant(false), 1), ...shift(P.giant(true), 11), ...shift(P.big(false), 6)],
];

/** 1 日 = 最大 3 ウェーブ。8/13(迎え盆)・8/14・8/15(お盆)の 3 日を凌げばクリア */
export const WAVES_PER_DAY = 3;
export const DAYS = 3;
const WAVES: Group[][] = [
  // 上から来るのばかりだと縦の提灯ばかり効くので、左右の端から横一列に来る組を各ウェーブに混ぜる
  [...OLD[0], ...shift(few(P.sideL(false), 3), 10)],
  [...OLD[1], ...shift(few(P.sideK(false), 3), 7)],
  [...OLD[2], ...shift(P.sideL(true), 8)], // 8/13: 顔見世、サクサク
  [...OLD[3], ...shift(P.sideK(true), 10)],
  [...OLD[5], ...shift(P.sides(false), 2)],
  [...OLD[6], ...shift(P.sideL(false), 13)], // 8/14: 型を重ねる
  [...OLD[7], ...shift(P.sides(true), 6)],
  [...OLD[8], ...shift(P.sideK(false), 4)],
  [...OLD[9], ...shift(few(P.sides(false), 2), 4)], // 8/15: お盆の本番
];
export const WAVE_COUNT = WAVES.length;
/** n ウェーブ目が何日目か(0 = 8/13)と、その日の何番目か */
export const dayOf = (n: number) => Math.floor(n / WAVES_PER_DAY);
export const waveInDay = (n: number) => n % WAVES_PER_DAY;
export const OPENING_WAVES = WAVES.length;

/** n 刻目の出方(10 刻より先は、型を混ぜて毎回変わる。いまは 10 刻でクリア) */
export function waveGroups(n: number, rng: Rng): Group[] {
  if (n < WAVES.length) return WAVES[n].map((g) => ({ ...g }));
  const keys = Object.keys(PATTERNS);
  const out: Group[] = [];
  let t = 0;
  for (let i = 0; i < 5; i++) { out.push(...shift(PATTERNS[rng.pick(keys)](rng.chance(0.5)), t)); t += 3 + rng.next() * 3; }
  return out;
}
