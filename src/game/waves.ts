// 刻ごとのおばけの出方(全 10 刻でクリア)。1 刻目は型を 1 つだけ、2 刻目からは型を重ねて忙しくする。
// 説明の文字は出さない。出方そのものが「こういう時はこう」を教える。
//
// 型(と、その答えの一例):
//   一列     … 縦に並んで降りてくる → 縦の家の提灯を列の中ほどへ
//   横並び   … 横に並んで降りてくる → 横の家の提灯を並んだ高さへ。端まで届かなければ 2 つ置いて誘爆
//   階段     … 縦に降り、横へ渡り、また縦に降りる → 横へ渡る所を横で、降りる所を縦で
//   交差     … 左右から来て真ん中で交わる → 交わる所と時に、丸で
//   ジグザグ … 斜めと縦を交互に → 縦に降りる所を縦で
//   輪       … 輪を描いてから突っ込む(ギャラガ)→ 輪の真ん中に丸
//   大入道   … 大きくてゆっくり、光 3 回で成仏 → 誘爆で何度も光を当てる。止めて詰まらせて重ねる
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
  /** 階段: 横へ渡る高さ(0 = 上の端、1 = 家の高さ) */
  turn?: number;
}

type Pattern = (m: boolean) => Group[];
/** m = 左右を入れ替える */
const X = (c: number, m: boolean) => (m ? 12 - c : c);
const T = (h: number, m: boolean) => (m ? 5 - h : h);

export const PATTERNS: Record<string, Pattern> = {
  line: (m) => [{ t: 0, kind: 'fuwa', cols: [X(5, m)], n: 5, gap: 1.6, to: T(2, m) }],
  row: (m) => [{ t: 0, kind: 'fuwa', cols: [X(3, m), X(4, m), X(5, m), X(6, m), X(7, m)], n: 1, gap: 0, to: T(2, m), turn: 0.6 }],
  stair: (m) => [{ t: 0, kind: 'fuwa', cols: [X(1, m)], n: 5, gap: 1.6, to: T(4, m), turn: 0.4 }],
  cross: (m) => [
    { t: 0, kind: 'fuwa', cols: [X(1, m)], n: 4, gap: 1.6, to: T(4, m), turn: 0.5 },
    { t: 0, kind: 'fuwa', cols: [X(11, m)], n: 4, gap: 1.6, to: T(1, m), turn: 0.5 },
  ],
  zigzag: (m) => [{ t: 0, kind: 'kasa', cols: [X(8, m)], n: 4, gap: 2.0, to: T(3, m), side: 1 }],
  loop: (m) => [{ t: 0, kind: 'oni', cols: [X(2, m)], n: 5, gap: 0.9, to: T(3, m), side: m ? -1 : 1 }],
  dam: (m) => [{ t: 0, kind: 'fuwa', cols: [X(10, m)], n: 7, gap: 2.2, to: T(5, m) }],
  big: (m) => [{ t: 0, kind: 'big', cols: [X(6, m)], n: 1, gap: 0, to: T(2, m), turn: 0.5 }],
};

const P = PATTERNS;
function shift(gs: Group[], dt: number): Group[] { return gs.map((g) => ({ ...g, t: g.t + dt })); }

/** 全 10 刻(決まった出方) */
const WAVES: Group[][] = [
  P.line(false),
  [...P.row(false), ...shift(P.line(true), 6)],
  [...P.stair(false), ...shift(P.cross(true), 5)],
  [...P.zigzag(false), ...shift(P.zigzag(true), 3), ...shift(P.line(false), 8), ...shift(P.big(false), 4)],
  [...P.loop(false), ...shift(P.row(true), 7)],
  [...P.dam(false), ...shift(P.zigzag(true), 4), ...shift(P.stair(true), 10), ...shift(P.big(true), 6)],
  [...P.loop(false), ...shift(P.loop(true), 5), ...shift(P.cross(false), 10)],
  [...P.row(false), ...shift(P.row(true), 4), ...shift(P.zigzag(false), 8), ...shift(P.line(true), 12), ...shift(P.big(false), 2)],
  [...P.cross(false), ...shift(P.loop(true), 3), ...shift(P.dam(false), 6), ...shift(P.stair(true), 11)],
  [...P.loop(false), ...shift(P.row(true), 3), ...shift(P.zigzag(false), 6), ...shift(P.cross(true), 9), ...shift(P.loop(true), 13), ...shift(P.big(false), 1), ...shift(P.big(true), 10)],
];

export const WAVE_COUNT = WAVES.length;
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
