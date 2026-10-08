// 面(手作りの迷路と、決まったおばけの出方)。どの面にも「正解」の仕込みがあり、手本(demo)で見せられる。
// 面の狙いは「量のマネジメント」ではなく「どこに・何を仕込み・いつ・どこから弾けさせるか」。
// 増やす時: map を描き、waves を決め、tools/stage.mjs で道筋を見ながら手本を作り、goal(手本の最大連鎖)を書く。
//   node tools/stage.mjs 3 trace … 手本を流しながら 0.5 秒ごとの盤面と出来事を文字で出す
//   DEMO='[[4,2,6],[4.1,4,3]]' node tools/stage.mjs 3 demo … 別の打ち方を試す(間違いの手が★3 に届かないことも確かめる)
//
// 仕込みの型(面の種。組み合わせて増やす):
//   一列     … 列で来る群れの先頭を罠で止め、詰まってから弾く(成仏の光が隣へ移って列ごと消える)
//   寄せ場   … 二本の道の両方から呼べるマスに罠。先に来た群れが見とれ終わる前に弾く(時間の窓)
//   横一列   … 罠にかからない影法師が横に並ぶ時を読み、横の光を提灯から提灯へ(誘爆のリレー)
//   向き     … 近い家ではなく、光の向きが合う家を選んで投げる。着いたら弾ける提灯で
//   足止め   … 影法師は灯った提灯の周りを通らない。提灯で道をふさいで待たせ、別の提灯の光でまとめる
//   (未)盾   … 板塀で光が止まる。塀のどちら側に置くか
//   (未)飛来 … 鬼火・唐傘は壁を越えて決まった線で来る。線が重なる所と時を読む
//   (未)分散 … 家が消えると群れの行き先が変わり、ばらける。消える前に仕留める
//   群れの間(gap)は設計のつまみ: 詰めれば寄せて一網打尽、空ければ光の向き・長さが効く
import type { GhostKind } from './logic';

export interface Group {
  /** 刻が始まってからの秒 */
  t: number;
  /** あの世の口の番号(地図の 1-9) */
  from: number;
  kind: GhostKind;
  n: number;
  /** 群れの中の間(秒)。省略で wave.convoy */
  gap?: number;
}
export interface Stage {
  key: string;
  name: { ja: string; en: string };
  /** 面の狙い(仕込みの型)。始まる前に一言だけ出す */
  idea: { ja: string; en: string };
  /** マスの行と板塀の行を交互に(logic.ts の readMap) */
  map: string[];
  /** 1 軒の軒先の提灯(刻ごと) */
  ammo: number;
  /** ★3 の連鎖数(手本で出せる数) */
  goal: number;
  waves: Group[][];
  /** 手本: [秒, 列, 行]。家のマス = 選ぶ、提灯のマス = 弾けさせる、それ以外 = 投げる */
  demo: Array<[number, number, number]>;
}

export const STAGES: Stage[] = [
  {
    key: 'line',
    name: { ja: '一本道', en: 'One Road' },
    idea: { ja: '列で来る。先頭を罠で止め、列が詰まってから弾けさせる', en: 'They come in a line. Stop the head with a trap, burst when the line bunches up.' },
    map: [
      '. . . . . . 1 . . . . . .',
      '',
      '. # # # # . . . # # # # .',
      '',
      '. # . . # . . . # . . # .',
      '',
      '. # . . # . . . # . . # .',
      '',
      '. # # # # . . . # # # # .',
      '',
      '. . . . . . . . . . . . .',
      '',
      '. . O . . . U . . . D . .',
    ],
    ammo: 2, goal: 6,
    waves: [[{ t: 0, from: 1, kind: 'fuwa', n: 6 }]],
    demo: [[4, 6, 3], [14, 6, 3]],
  },
  {
    key: 'gather',
    name: { ja: '寄せ場', en: 'Meeting Point' },
    idea: { ja: '二本の道。両方から呼べるマスはどこか。先に来た群れが離れる前に弾けさせる', en: 'Two roads. Which square calls both? Burst before the first group walks off.' },
    map: [
      '# # # 1 # # # # # 2 # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # . . . . . . . # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # U # # # # # D # # #',
    ],
    ammo: 2, goal: 8,
    waves: [[{ t: 0, from: 1, kind: 'fuwa', n: 4, gap: 1 }, { t: 0.5, from: 2, kind: 'fuwa', n: 4, gap: 1 }]],
    demo: [[6, 6, 3], [23, 6, 3]],
  },
  {
    key: 'row',
    name: { ja: '横一列', en: 'Side by Side' },
    idea: { ja: '影法師は罠にかからない。横に並ぶ時を読み、横の光を提灯から提灯へつなぐ', en: 'Shadows ignore traps. Read when they line up, and pass sideways light from lantern to lantern.' },
    map: [
      '# # 1 # # # 2 # # # 3 # #',
      '',
      '# # . # # # . # # # . # #',
      '',
      '# # . # # # . # # # . # #',
      '',
      '. . . . . . . . . . . . .',
      '',
      '# # . # # # . # # # . # #',
      '',
      '# # . # # # . # # # . # #',
      '',
      '# # H # # # O # # # H # #',
    ],
    ammo: 2, goal: 6,
    waves: [[{ t: 0, from: 1, kind: 'kirai', n: 2, gap: 1.5 }, { t: 0, from: 2, kind: 'kirai', n: 2, gap: 1.5 }, { t: 0, from: 3, kind: 'kirai', n: 2, gap: 1.5 }]],
    demo: [[4, 2, 6], [4.1, 4, 3], [5, 10, 6], [5.1, 8, 3], [12, 4, 3]],
  },
  {
    key: 'updown',
    name: { ja: '上と下', en: 'Up and Down' },
    idea: { ja: '影法師は灯りを避ける。着いたら弾ける提灯を、向きの合う家から(近い家とは限らない)', en: 'Shadows avoid lit lanterns. Throw one that bursts on landing, from the house whose light points the right way.' },
    map: [
      '# # # . # # # # # 1 # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # U . . . . . D # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # 2 # # # # # . # # #',
    ],
    ammo: 2, goal: 3,
    waves: [[{ t: 0, from: 1, kind: 'kirai', n: 3, gap: 1.5 }, { t: 6, from: 2, kind: 'kirai', n: 3, gap: 1.5 }]],
    demo: [[4.5, 3, 3], [4.7, 9, 2], [5, 9, 2], [10.5, 9, 3], [10.7, 3, 4], [11, 3, 4]],
  },
  {
    key: 'mix',
    name: { ja: '合わせ技', en: 'Combination' },
    idea: { ja: '寄せる刻、向きで撃つ刻、両方が来る刻。どの家の提灯をいつ使うか', en: 'Gather, aim, then both at once. Which house, and when?' },
    map: [
      '# # # 1 # # # # # 2 # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # . . . O . . . # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # . # # # # # . # # #',
      '',
      '# # # U # # # # # D # # #',
    ],
    ammo: 1, goal: 7,
    waves: [
      [{ t: 5, from: 1, kind: 'fuwa', n: 3, gap: 1 }, { t: 0, from: 2, kind: 'fuwa', n: 3, gap: 1 }],
      [{ t: 0, from: 1, kind: 'kirai', n: 3, gap: 1.5 }, { t: 4, from: 2, kind: 'kirai', n: 3, gap: 1.5 }],
      [{ t: 0, from: 1, kind: 'fuwa', n: 4, gap: 1 }, { t: 0, from: 2, kind: 'kirai', n: 3, gap: 1.5 }],
    ],
    demo: [[8, 5, 3], [24.5, 5, 3], [34.3, 3, 6], [34.5, 3, 3], [34.7, 3, 3], [35.8, 9, 1], [36, 9, 1], [45, 8, 3], [54.8, 3, 6], [55, 9, 2], [67, 8, 3]],
  },
];

/** 記録(?replay=)の seed から面を引く。面の seed は -(番号 + 1) */
export const stageSeed = (i: number) => -(i + 1);
export const stageOfSeed = (seed: number): Stage | null => (seed < 0 ? STAGES[-seed - 1] ?? null : null);
