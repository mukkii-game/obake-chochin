// 調整つまみの一覧(唯一の置き場)。数値をコードに直書きせず、ここに名前・単位・狙いを付けて置く。
// ゲーム中に F2(スマホは画面左上を 3 回タップ)で調整パネルが開き(Esc は作品の一時停止に空けておく)、スライダー・数値・選択肢で直せる。
// パネルの「コピー」で今の値が JSON で取れる。AI に貼れば value を書き換えて既定値にできる。
// 読み方: import { tune } from './core/tuning'; tune('player.speed')
// 多くの値は「次のプレイから」効く(Play 開始時に src/game/params.ts が読む)。
export type Knob =
  | { key: string; label: string; value: number; min: number; max: number; step: number; unit?: string; aim?: string }
  | { key: string; label: string; value: string; options: string[]; aim?: string }
  | { key: string; label: string; value: boolean; aim?: string };

export const KNOBS: Knob[] = [
  // 都(マス目の迷路)。柱のマス(ボンバーマン)と、マスの間の細い板塀(ドルアーガ)
  { key: 'piece.set', label: '家(提灯)の種類', value: '上・下・周り', options: ['上・下・周り', '上・下・周り・横', '縦・横・十字・周り'], aim: '家の形 = 光の形。少ないほど読みやすい' },
  { key: 'maze.walls', label: '板塀の数', value: 10, min: 0, max: 30, step: 1, unit: '枚', aim: '多いほど迷路。光も板塀で止まる' },
  // 提灯(投げる → マスに下がる罠 → 押すと家の形どおりに光る)。サインは出さない。速さ・広がり方を一定にして読ませる
  { key: 'lantern.max', label: '同時に下げられる提灯', value: 3, min: 1, max: 6, step: 1, unit: '個', aim: 'SPEC では 3。飛んでいるものも数える' },
  { key: 'lantern.perHouse', label: '1 軒の軒先の提灯', value: 3, min: 1, max: 10, step: 1, unit: '個/刻', aim: '家が消えるとその家の分も消える' },
  { key: 'lantern.speed', label: '提灯の飛ぶ速さ', value: 130, min: 60, max: 800, step: 10, unit: 'px/秒', aim: 'ゆっくり。着くまでの間を読む' },
  { key: 'lure.n', label: '提灯が呼ぶ距離', value: 3, min: 0, max: 8, step: 1, unit: 'マス', aim: '歩くおばけは迷路の道のり、飛ぶおばけはまっすぐの距離' },
  { key: 'lure.capture', label: '提灯に見とれる時間', value: 4, min: 0.5, max: 10, step: 0.1, unit: '秒', aim: '罠にかかっている間。ここで弾けさせる' },
  // 光(家の形どおり)
  { key: 'light.line', label: '上・下の光の届くマス', value: 4, min: 1, max: 8, step: 1, unit: 'マス', aim: '縦に並べば遠くまで連鎖する。柱と板塀で止まる' },
  { key: 'light.area', label: '周りの光の広さ', value: 1, min: 1, max: 3, step: 1, unit: 'マス', aim: '1 = 周り 8 マス' },
  { key: 'light.speed', label: '光の広がる速さ', value: 2.2, min: 0.5, max: 10, step: 0.1, unit: 'マス/秒', aim: 'ゆっくり広がる。歩いてくるおばけと出会う時を読む' },
  { key: 'light.hold', label: '光が 1 マスを照らす時間', value: 0.9, min: 0.1, max: 3, step: 0.1, unit: '秒', aim: '光は帯になって形の上を走る。どのマスも同じ間だけ照らされる' },
  { key: 'wisp.delay', label: '成仏したおばけが弾けるまで', value: 0.4, min: 0, max: 2, step: 0.05, unit: '秒' },
  { key: 'wisp.reach', label: '成仏したおばけが隣のマスも照らす', value: true, aim: '群れで来れば、つながって連鎖する' },
  { key: 'chain.relightAt', label: '家の灯りが戻る連鎖数', value: 10, min: 3, max: 30, step: 1, unit: '連' },
  { key: 'score.base', label: '1体の基本点', value: 10, min: 1, max: 100, step: 1, unit: '点', aim: 'n 連目は基本点 × n' },
  // 家
  { key: 'house.haunt', label: '家の人が騒いでから逃げ出すまで', value: 1.5, min: 0, max: 8, step: 0.1, unit: '秒', aim: '短い。家の前で待ち受けるのではなく、手前で仕留めるため。騒いでいる家は提灯を投げられない' },
  // おばけ
  { key: 'ghost.speed', label: 'おばけの基本の速さ', value: 24, min: 8, max: 100, step: 1, unit: 'px/秒', aim: 'マス 1 つを約 2.5 秒' },
  { key: 'ghost.speedRamp', label: '刻ごとの速さ増', value: 0.05, min: 0, max: 0.5, step: 0.01, unit: '倍/刻' },
  // 刻(攻撃の波)
  { key: 'wave.base', label: '最初の刻のおばけの数', value: 7, min: 2, max: 40, step: 1, unit: '体' },
  { key: 'wave.grow', label: '刻ごとの増え方', value: 3, min: 0, max: 15, step: 1, unit: '体/刻' },
  { key: 'wave.gap', label: '群れと群れの間', value: 6.5, min: 0.5, max: 15, step: 0.1, unit: '秒', aim: '刻が進むと 0.25 秒ずつ詰まる' },
  { key: 'wave.gapMin', label: '群れの間の最短', value: 2.5, min: 0.3, max: 8, step: 0.1, unit: '秒' },
  { key: 'wave.convoy', label: '群れの中の間', value: 1.3, min: 0.1, max: 4, step: 0.05, unit: '秒', aim: '同じ道に列を作る(縦に並べば上・下の光で一網打尽)' },
  { key: 'wave.portalEvery', label: 'あの世の口が増える間隔', value: 3, min: 1, max: 20, step: 1, unit: '刻ごと', aim: '口は 1 → 2 → 3 つ' },
  { key: 'wave.bonus', label: '刻を越えた時の 1 軒あたりの点', value: 50, min: 0, max: 500, step: 10, unit: '点×刻' },
  { key: 'wave.ammoBonus', label: '余った提灯 1 つの点', value: 20, min: 0, max: 300, step: 5, unit: '点×刻' },
  // 演出
  { key: 'juice.shake', label: '家の灯りが消えた時の揺れ', value: 0.012, min: 0, max: 0.05, step: 0.002, unit: '画面比' },
  { key: 'juice.hitstop', label: '大連鎖の一瞬の止まり', value: 60, min: 0, max: 200, step: 10, unit: 'ms', aim: '8 連以上で効く' },
  { key: 'audio.bgm', label: 'BGM', value: true },
];
