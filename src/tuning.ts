// 調整つまみの一覧(唯一の置き場)。数値をコードに直書きせず、ここに名前・単位・狙いを付けて置く。
// ゲーム中に F2(スマホは画面左上を 3 回タップ)で調整パネルが開き(Esc は作品の一時停止に空けておく)、スライダー・数値・選択肢で直せる。
// パネルの「コピー」で今の値が JSON で取れる。AI に貼れば value を書き換えて既定値にできる。
// 読み方: import { tune } from './core/tuning'; tune('player.speed')
export type Knob =
  | { key: string; label: string; value: number; min: number; max: number; step: number; unit?: string; aim?: string }
  | { key: string; label: string; value: string; options: string[]; aim?: string }
  | { key: string; label: string; value: boolean; aim?: string };

export const KNOBS: Knob[] = [
  { key: 'player.speed', label: '自機の速さ', value: 300, min: 50, max: 800, step: 10, unit: 'px/秒', aim: '画面の端から端まで約2秒' },
  { key: 'game.duration', label: '制限時間', value: 20, min: 5, max: 120, step: 1, unit: '秒', aim: '1回が短く、すぐもう1回やりたくなる' },
  { key: 'score.per', label: '1回の加点', value: 10, min: 1, max: 100, step: 1, unit: '点' },
  { key: 'juice.pop', label: '加点時の膨らみ', value: 1.3, min: 1, max: 2, step: 0.05, unit: '倍', aim: '押した手応え' },
];
