// 刻ごとのおばけの出方。最初の 8 刻は「このゲームならではの攻め方の型」を 1 つずつ出し切り、
// 後半はそれらを混ぜる(9 刻目からは型を組み合わせて毎回変わる。速さも少しずつ上がる)。
// 説明の文字は出さない。出方そのものが「こういう時はこう」を教える。
//
// 型(と、その答えの一例):
//   一列     … 縦に並んで降りてくる → 縦の楼の提灯を、列が収まる時に
//   横並び   … 横に並んで降りてくる → 長屋の提灯を、並んだ高さに。端まで届かなければ 2 つ並べて誘爆
//   交差     … 左右から斜めに来て真ん中で交わる → 交わる所と時に
//   ジグザグ … 左右に折れながら来る → 列の真ん中を横で、または下げて待つ
//   曲線     … 大きく曲がって来る → 曲がり終わる所に下げて待ち、詰まった所を弾く
//   せき止め … 間をあけて長く続く → 下げた提灯で先頭を止め、詰まって縦に並んだ所を縦で
import type { GhostKind } from './logic';
import type { Rng } from '../core/rng';

export interface Group {
  /** 刻が始まってからの秒 */
  t: number;
  kind: GhostKind;
  /** 出てくる列(0-12)。複数なら横に並んで同時に出る */
  cols: number[];
  /** 何回出るか(列なら縦に並ぶ) */
  n: number;
  /** 出る間(秒) */
  gap: number;
  /** 向かう家(0-5、左から)。省略で一番近い家 */
  to?: number;
  /** ジグザグの最初の向き・曲線の曲がる向き(±1) */
  side?: number;
}

type Pattern = (m: boolean) => Group[];
/** m = 左右を入れ替える */
const X = (c: number, m: boolean) => (m ? 12 - c : c);
const T = (h: number, m: boolean) => (m ? 5 - h : h);

export const PATTERNS: Record<string, Pattern> = {
  line: (m) => [{ t: 0, kind: 'fuwa', cols: [X(5, m)], n: 5, gap: 1.6, to: T(2, m) }],
  row: (m) => [{ t: 0, kind: 'fuwa', cols: [X(3, m), X(4, m), X(5, m), X(6, m), X(7, m)], n: 1, gap: 0, to: T(2, m) }],
  cross: (m) => [
    { t: 0, kind: 'fuwa', cols: [X(0, m)], n: 4, gap: 1.8, to: T(5, m) },
    { t: 0, kind: 'fuwa', cols: [X(12, m)], n: 4, gap: 1.8, to: T(0, m) },
  ],
  zigzag: (m) => [{ t: 0, kind: 'kasa', cols: [X(7, m)], n: 4, gap: 2.2, to: T(3, m), side: 1 }],
  curve: (m) => [{ t: 0, kind: 'oni', cols: [X(1, m)], n: 4, gap: 1.6, to: T(3, m), side: m ? 1 : -1 }],
  dam: (m) => [{ t: 0, kind: 'fuwa', cols: [X(9, m)], n: 7, gap: 2.4, to: T(4, m) }],
};

/** 最初の 8 刻(決まった出方) */
const OPENING: Group[][] = [
  PATTERNS.line(false),
  PATTERNS.row(false),
  PATTERNS.cross(false),
  PATTERNS.zigzag(false),
  PATTERNS.curve(false),
  PATTERNS.dam(false),
  [...PATTERNS.line(true), ...shift(PATTERNS.row(false), 9)],
  [...PATTERNS.zigzag(true), ...shift(PATTERNS.curve(false), 4), ...shift(PATTERNS.cross(true), 12)],
];

function shift(gs: Group[], dt: number): Group[] { return gs.map((g) => ({ ...g, t: g.t + dt })); }

export const OPENING_WAVES = OPENING.length;

/** n 刻目の出方。最初は決まった型、後は型を混ぜる(乱数はゲームの seed から) */
export function waveGroups(n: number, rng: Rng): Group[] {
  if (n < OPENING.length) return OPENING[n].map((g) => ({ ...g }));
  const keys = Object.keys(PATTERNS);
  const k = Math.min(5, 2 + Math.floor((n - OPENING.length) / 2));
  const out: Group[] = [];
  let t = 0;
  for (let i = 0; i < k; i++) {
    out.push(...shift(PATTERNS[rng.pick(keys)](rng.chance(0.5)), t));
    t += 3 + rng.next() * 4;
  }
  return out;
}
