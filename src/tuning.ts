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
  // 提灯
  { key: 'lantern.max', label: '同時に置ける提灯', value: 3, min: 1, max: 6, step: 1, unit: '個', aim: 'SPEC では 3。置き場所を選ばせる' },
  { key: 'lantern.attract', label: '提灯の寄せ範囲', value: 120, min: 50, max: 250, step: 5, unit: 'px', aim: '画面幅の 1/8 ほど。先読みして置けば届く' },
  { key: 'lantern.life', label: '提灯の燃える時間', value: 9, min: 3, max: 30, step: 0.5, unit: '秒', aim: '溜めたい欲と、燃え尽きて逃げられる怖さの綱引き' },
  { key: 'lantern.burst', label: '割った時の成仏範囲', value: 70, min: 30, max: 200, step: 5, unit: 'px', aim: '集まった輪がちょうど収まる' },
  { key: 'lantern.burstPer', label: '溜めた数ごとの範囲増', value: 4, min: 0, max: 20, step: 1, unit: 'px/体', aim: '溜めるほど大きく割れる' },
  { key: 'lantern.tapR', label: '提灯を割るタップの当たり', value: 42, min: 20, max: 80, step: 2, unit: 'px', aim: 'スマホの指でも外さない' },
  { key: 'lantern.orbit', label: '寄ったおばけの輪の半径', value: 30, min: 12, max: 70, step: 2, unit: 'px' },
  // 連鎖
  { key: 'chain.radius', label: '成仏の波の半径', value: 52, min: 20, max: 120, step: 2, unit: 'px', aim: '固まっていれば次々つながる' },
  { key: 'chain.delay', label: '連鎖の間', value: 0.11, min: 0.02, max: 0.4, step: 0.01, unit: '秒', aim: 'ポポポポと数えられる速さ' },
  { key: 'chain.relightAt', label: '家の灯りが戻る連鎖数', value: 8, min: 3, max: 30, step: 1, unit: '連', aim: '大連鎖のごほうび' },
  { key: 'score.base', label: '1体の基本点', value: 10, min: 1, max: 100, step: 1, unit: '点', aim: 'n 連目は基本点 × n' },
  // 味方の灯り(成仏したおばけ)
  { key: 'wisp.life', label: '味方の灯りの時間', value: 3.5, min: 0.5, max: 10, step: 0.5, unit: '秒' },
  { key: 'wisp.attract', label: '味方の灯りの寄せ範囲', value: 66, min: 0, max: 160, step: 2, unit: 'px', aim: '光を嫌うおばけも、これには寄る' },
  { key: 'wisp.pop', label: '味方の灯りが弾ける範囲', value: 46, min: 0, max: 120, step: 2, unit: 'px' },
  // おばけ
  { key: 'ghost.speed', label: 'おばけの基本の速さ', value: 30, min: 10, max: 100, step: 1, unit: 'px/秒', aim: '端から家まで 8〜10 秒' },
  { key: 'ghost.speedRamp', label: '夜更けの速さ増', value: 0.25, min: 0, max: 1, step: 0.05, unit: '倍/分' },
  { key: 'spawn.rate0', label: '最初の出現数', value: 0.45, min: 0.1, max: 3, step: 0.05, unit: '体/秒' },
  { key: 'spawn.rateGrow', label: '夜更けの出現増', value: 0.55, min: 0, max: 3, step: 0.05, unit: '体/秒/分', aim: '3 分ほどで手が回らなくなる' },
  { key: 'spawn.zigAt', label: 'ジグザグが出始める', value: 20, min: 0, max: 300, step: 5, unit: '秒' },
  { key: 'spawn.hopAt', label: '跳ねるのが出始める', value: 40, min: 0, max: 300, step: 5, unit: '秒' },
  { key: 'spawn.kiraiAt', label: '光嫌いが出始める', value: 65, min: 0, max: 300, step: 5, unit: '秒' },
  { key: 'spawn.groupAt', label: '群れで来始める', value: 50, min: 0, max: 300, step: 5, unit: '秒' },
  // 演出
  { key: 'juice.shake', label: '家の灯りが消えた時の揺れ', value: 0.012, min: 0, max: 0.05, step: 0.002, unit: '画面比' },
  { key: 'juice.hitstop', label: '大連鎖の一瞬の止まり', value: 60, min: 0, max: 200, step: 10, unit: 'ms', aim: '8 連以上で効く' },
  { key: 'audio.bgm', label: 'BGM', value: true },
];
