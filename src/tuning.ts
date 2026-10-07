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
  // 提灯(飛ばす → 灯って呼び寄せる → いつも同じ間で弾ける)。サインは出さない。速さ・間・大きさを一定にして読ませる
  { key: 'lantern.max', label: '同時に出せる提灯', value: 3, min: 1, max: 6, step: 1, unit: '個', aim: 'SPEC では 3。飛んでいるものも数える' },
  { key: 'lantern.perHouse', label: '1 軒の軒先の提灯', value: 3, min: 1, max: 10, step: 1, unit: '個/刻', aim: 'ミサイルコマンドの基地の弾。家が消えるとその家の分も消える' },
  { key: 'lantern.speed', label: '提灯の飛ぶ速さ', value: 300, min: 100, max: 1200, step: 10, unit: 'px/秒', aim: '先読みが要るが、読めば当たる' },
  { key: 'lantern.fuse', label: '灯ってから弾けるまで', value: 1.2, min: 0.3, max: 5, step: 0.1, unit: '秒', aim: 'いつも同じ。呼び寄せたおばけが寄り切る長さ' },
  { key: 'lantern.tapR', label: '提灯を押す当たり', value: 40, min: 20, max: 80, step: 2, unit: 'px', aim: 'スマホの指でも外さない' },
  { key: 'lure.r', label: '灯りが呼ぶ範囲', value: 60, min: 40, max: 250, step: 5, unit: 'px', aim: '明るい所がそのまま範囲' },
  { key: 'kirai.r', label: '光嫌いが避ける距離', value: 70, min: 20, max: 200, step: 2, unit: 'px', aim: '灯った提灯には捕まらない。飛んでいる提灯を押して、着いた所で弾けさせる' },
  // 成仏の光(広がって・留まって・縮む。いつも同じ)
  { key: 'blast.r', label: '成仏の光の半径', value: 48, min: 20, max: 160, step: 2, unit: 'px' },
  { key: 'blast.dur', label: '成仏の光の長さ', value: 1.0, min: 0.3, max: 3, step: 0.05, unit: '秒' },
  // 連鎖
  { key: 'chain.radius', label: '連鎖の光の半径', value: 34, min: 10, max: 120, step: 2, unit: 'px', aim: '固まっていれば次々つながる' },
  { key: 'chain.delay', label: '連鎖の間', value: 0.08, min: 0, max: 0.4, step: 0.01, unit: '秒' },
  { key: 'chain.dur', label: '連鎖の光の長さ', value: 0.55, min: 0.2, max: 2, step: 0.05, unit: '秒' },
  { key: 'chain.relightAt', label: '家の灯りが戻る連鎖数', value: 10, min: 3, max: 30, step: 1, unit: '連' },
  { key: 'score.base', label: '1体の基本点', value: 10, min: 1, max: 100, step: 1, unit: '点', aim: 'n 連目は基本点 × n' },
  { key: 'wisp.life', label: '人魂が弾けるまで', value: 0.8, min: 0.2, max: 5, step: 0.1, unit: '秒' },
  { key: 'wisp.pop', label: '人魂が弾ける範囲', value: 30, min: 0, max: 120, step: 2, unit: 'px' },
  // 家
  { key: 'house.haunt', label: '家の人が騒いでから逃げ出すまで', value: 2.2, min: 0, max: 8, step: 0.1, unit: '秒', aim: 'この間に入ったおばけを成仏させれば家は助かる' },
  // おばけ
  { key: 'ghost.speed', label: 'おばけの基本の速さ', value: 38, min: 10, max: 100, step: 1, unit: 'px/秒' },
  { key: 'ghost.speedRamp', label: '刻ごとの速さ増', value: 0.07, min: 0, max: 0.5, step: 0.01, unit: '倍/刻' },
  { key: 'ghost.hopDist', label: '唐傘のひと跳び', value: 60, min: 20, max: 200, step: 5, unit: 'px', aim: 'いつも同じ距離・同じ間' },
  { key: 'ghost.zigLeg', label: '鬼火が折れる間', value: 1.1, min: 0.3, max: 4, step: 0.1, unit: '秒' },
  // 刻(攻撃の波)
  { key: 'wave.base', label: '最初の刻のおばけの数', value: 8, min: 2, max: 40, step: 1, unit: '体' },
  { key: 'wave.grow', label: '刻ごとの増え方', value: 3, min: 0, max: 15, step: 1, unit: '体/刻' },
  { key: 'wave.gap', label: '群れと群れの間', value: 3.2, min: 0.5, max: 8, step: 0.1, unit: '秒', aim: '刻が進むと 0.2 秒ずつ詰まる' },
  { key: 'wave.gapMin', label: '群れの間の最短', value: 1.2, min: 0.3, max: 5, step: 0.1, unit: '秒' },
  { key: 'wave.portalEvery', label: 'あの世の口が増える間隔', value: 3, min: 1, max: 20, step: 1, unit: '刻ごと', aim: '口は 1 → 2 → 3 つ' },
  { key: 'wave.bonus', label: '刻を越えた時の 1 軒あたりの点', value: 50, min: 0, max: 500, step: 10, unit: '点×刻' },
  { key: 'wave.ammoBonus', label: '余った提灯 1 つの点', value: 20, min: 0, max: 300, step: 5, unit: '点×刻' },
  // 演出
  { key: 'juice.shake', label: '家の灯りが消えた時の揺れ', value: 0.012, min: 0, max: 0.05, step: 0.002, unit: '画面比' },
  { key: 'juice.hitstop', label: '大連鎖の一瞬の止まり', value: 60, min: 0, max: 200, step: 10, unit: 'ms', aim: '8 連以上で効く' },
  { key: 'audio.bgm', label: 'BGM', value: true },
];
