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
  // 提灯(投げる → 辻に下がる罠 → 押すと十字に弾ける)。サインは出さない。速さ・広がり方を一定にして読ませる
  { key: 'lantern.max', label: '同時に下げられる提灯', value: 3, min: 1, max: 6, step: 1, unit: '個', aim: 'SPEC では 3。飛んでいるものも数える' },
  { key: 'lantern.perHouse', label: '1 軒の軒先の提灯', value: 3, min: 1, max: 10, step: 1, unit: '個/刻', aim: '家が消えるとその家の分も消える' },
  { key: 'lantern.speed', label: '提灯の飛ぶ速さ', value: 170, min: 60, max: 800, step: 10, unit: 'px/秒', aim: 'ゆっくり。着くまでの間を読む' },
  { key: 'lure.n', label: '提灯が呼ぶ距離', value: 3, min: 0, max: 8, step: 1, unit: '辻', aim: '通りを歩いてこの数の辻以内のおばけが寄ってくる' },
  { key: 'lure.capture', label: '提灯に見とれる時間', value: 3.5, min: 0.5, max: 10, step: 0.1, unit: '秒', aim: '罠にかかっている間。ここで弾けさせる' },
  // 十字の光(ボンバーマン)
  { key: 'light.range', label: '飛・角の光の届く辻の数', value: 2, min: 1, max: 6, step: 0.5, unit: '辻', aim: '他の提灯に届けば誘爆する' },
  { key: 'light.lance', label: '香の光の届く辻の数', value: 5, min: 1, max: 11, step: 1, unit: '辻', aim: '投げた向きにまっすぐ遠くまで' },
  { key: 'light.speed', label: '光の広がる速さ', value: 1.8, min: 0.5, max: 10, step: 0.1, unit: '辻/秒', aim: 'ゆっくり広がる。歩いてくるおばけと出会う時を読む' },
  { key: 'light.hold', label: '光が留まる時間', value: 0.5, min: 0, max: 3, step: 0.1, unit: '秒' },
  { key: 'wisp.delay', label: '成仏したおばけが弾けるまで', value: 0.35, min: 0, max: 2, step: 0.05, unit: '秒' },
  { key: 'wisp.range', label: '成仏したおばけの光の届く辻', value: 1, min: 0, max: 3, step: 0.5, unit: '辻', aim: '群れで来れば、つながって連鎖する' },
  { key: 'chain.relightAt', label: '家の灯りが戻る連鎖数', value: 10, min: 3, max: 30, step: 1, unit: '連' },
  { key: 'score.base', label: '1体の基本点', value: 10, min: 1, max: 100, step: 1, unit: '点', aim: 'n 連目は基本点 × n' },
  // 家
  { key: 'house.haunt', label: '家の人が騒いでから逃げ出すまで', value: 1.2, min: 0, max: 8, step: 0.1, unit: '秒', aim: '短い。家の前で待ち受けるのではなく、手前で仕留めるため。騒いでいる家は提灯を投げられない' },
  // おばけ
  { key: 'ghost.speed', label: 'おばけの基本の速さ', value: 34, min: 10, max: 100, step: 1, unit: 'px/秒', aim: '辻 1 つを約 2 秒' },
  { key: 'ghost.speedRamp', label: '刻ごとの速さ増', value: 0.06, min: 0, max: 0.5, step: 0.01, unit: '倍/刻' },
  { key: 'ghost.hopPause', label: '唐傘が辻で止まる時間', value: 1.6, min: 0, max: 5, step: 0.1, unit: '秒' },
  // 刻(攻撃の波)
  { key: 'wave.base', label: '最初の刻のおばけの数', value: 8, min: 2, max: 40, step: 1, unit: '体' },
  { key: 'wave.grow', label: '刻ごとの増え方', value: 3, min: 0, max: 15, step: 1, unit: '体/刻' },
  { key: 'wave.gap', label: '群れと群れの間', value: 5, min: 0.5, max: 12, step: 0.1, unit: '秒', aim: '刻が進むと 0.2 秒ずつ詰まる' },
  { key: 'wave.gapMin', label: '群れの間の最短', value: 2, min: 0.3, max: 8, step: 0.1, unit: '秒' },
  { key: 'wave.convoy', label: '群れの中の間', value: 0.8, min: 0.1, max: 3, step: 0.05, unit: '秒', aim: '同じ通りに列を作る' },
  { key: 'wave.portalEvery', label: 'あの世の口が増える間隔', value: 3, min: 1, max: 20, step: 1, unit: '刻ごと', aim: '口は 1 → 2 → 3 つ' },
  { key: 'wave.bonus', label: '刻を越えた時の 1 軒あたりの点', value: 50, min: 0, max: 500, step: 10, unit: '点×刻' },
  { key: 'wave.ammoBonus', label: '余った提灯 1 つの点', value: 20, min: 0, max: 300, step: 5, unit: '点×刻' },
  // 演出
  { key: 'juice.shake', label: '家の灯りが消えた時の揺れ', value: 0.012, min: 0, max: 0.05, step: 0.002, unit: '画面比' },
  { key: 'juice.hitstop', label: '大連鎖の一瞬の止まり', value: 60, min: 0, max: 200, step: 10, unit: 'ms', aim: '8 連以上で効く' },
  { key: 'audio.bgm', label: 'BGM', value: true },
];
