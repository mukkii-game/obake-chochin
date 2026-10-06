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
  // 提灯(飛ばす → 灯って呼び寄せる → 割る)
  { key: 'lantern.max', label: '同時に出せる提灯', value: 3, min: 1, max: 6, step: 1, unit: '個', aim: 'SPEC では 3。飛んでいるものも数える' },
  { key: 'lantern.speed', label: '提灯の飛ぶ速さ', value: 280, min: 100, max: 1200, step: 10, unit: 'px/秒', aim: '先読みが要るが、読めば当たる。遠い所は約1秒' },
  { key: 'lantern.tapR', label: '提灯・印を押す当たり', value: 40, min: 20, max: 80, step: 2, unit: 'px', aim: 'スマホの指でも外さない' },
  { key: 'lure.r', label: '呼び寄せる範囲', value: 120, min: 40, max: 250, step: 5, unit: 'px', aim: 'この輪に入ったおばけは提灯へ向かってくる' },
  { key: 'lure.speed', label: '呼ばれたおばけの速さ', value: 1.0, min: 0.3, max: 2, step: 0.05, unit: '倍', aim: '速いほど割りどきが短い' },
  { key: 'lantern.stun', label: '目の前に灯った時に止まる時間', value: 0.9, min: 0, max: 3, step: 0.1, unit: '秒', aim: 'ぴったり狙えたら割る暇がある' },
  { key: 'lantern.idle', label: '誰も呼べない提灯が消えるまで', value: 4, min: 1, max: 20, step: 0.5, unit: '秒', aim: '外した提灯で枠が詰まらない。消える前の 1.5 秒で薄れる' },
  // 割った時の成仏の光(広がって・留まって・縮む)
  { key: 'burst.min', label: '灯った直後に割った半径', value: 34, min: 10, max: 120, step: 2, unit: 'px', aim: '撃ち落とし(着いた瞬間に割る)の大きさ' },
  { key: 'burst.max', label: '育ちきって割った半径', value: 82, min: 20, max: 200, step: 2, unit: 'px', aim: '待つほど大きい。ただし先に着いたおばけに食われる' },
  { key: 'burst.charge', label: '育ちきるまで', value: 2.5, min: 0.3, max: 8, step: 0.1, unit: '秒' },
  { key: 'burst.dur', label: '成仏の光の長さ', value: 0.9, min: 0.3, max: 3, step: 0.05, unit: '秒', aim: '広がって、留まって、縮む。この間に触れたら成仏' },
  // 連鎖
  { key: 'chain.radius', label: '成仏の波の半径', value: 36, min: 10, max: 120, step: 2, unit: 'px', aim: '固まっていれば次々つながる' },
  { key: 'chain.delay', label: '連鎖の間', value: 0.08, min: 0.0, max: 0.4, step: 0.01, unit: '秒', aim: 'ポポポポと数えられる速さ' },
  { key: 'chain.dur', label: '連鎖の光の長さ', value: 0.55, min: 0.2, max: 2, step: 0.05, unit: '秒' },
  { key: 'chain.relightAt', label: '家の灯りが戻る連鎖数', value: 12, min: 3, max: 30, step: 1, unit: '連', aim: '大連鎖のごほうび' },
  { key: 'score.base', label: '1体の基本点', value: 10, min: 1, max: 100, step: 1, unit: '点', aim: 'n 連目は基本点 × n' },
  // 味方の灯り(成仏したおばけ)
  { key: 'wisp.life', label: '味方の灯りの時間', value: 2.2, min: 0.5, max: 10, step: 0.5, unit: '秒' },
  { key: 'wisp.attract', label: '味方の灯りの寄せ範囲', value: 50, min: 0, max: 160, step: 2, unit: 'px', aim: '光を嫌うおばけも、これには寄る' },
  { key: 'wisp.pop', label: '味方の灯りが弾ける範囲', value: 36, min: 0, max: 120, step: 2, unit: 'px' },
  // おばけ
  { key: 'ghost.speed', label: 'おばけの基本の速さ', value: 30, min: 10, max: 100, step: 1, unit: 'px/秒', aim: '端から家まで 8〜10 秒' },
  { key: 'ghost.speedRamp', label: '刻ごとの速さ増', value: 0.1, min: 0, max: 0.5, step: 0.01, unit: '倍/刻' },
  { key: 'ghost.hopDist', label: '唐傘のひと跳び', value: 70, min: 20, max: 200, step: 5, unit: 'px', aim: '着地点が予告されるので、そこへ置ける' },
  // 刻(攻撃の波)
  { key: 'wave.base', label: '最初の刻のおばけの数', value: 8, min: 2, max: 40, step: 1, unit: '体' },
  { key: 'wave.grow', label: '刻ごとの増え方', value: 4, min: 0, max: 15, step: 1, unit: '体/刻' },
  { key: 'wave.gap', label: '群れと群れの間', value: 3.4, min: 0.5, max: 8, step: 0.1, unit: '秒', aim: '刻が進むと 0.25 秒ずつ詰まる' },
  { key: 'wave.gapMin', label: '群れの間の最短', value: 1.1, min: 0.3, max: 5, step: 0.1, unit: '秒' },
  { key: 'wave.multi', label: '同時に来る群れが増える間隔', value: 3, min: 1, max: 20, step: 1, unit: '刻ごと' },
  { key: 'wave.bonus', label: '刻を越えた時の 1 軒あたりの点', value: 50, min: 0, max: 500, step: 10, unit: '点×刻' },
  // 演出
  { key: 'juice.shake', label: '家の灯りが消えた時の揺れ', value: 0.012, min: 0, max: 0.05, step: 0.002, unit: '画面比' },
  { key: 'juice.hitstop', label: '大連鎖の一瞬の止まり', value: 60, min: 0, max: 200, step: 10, unit: 'ms', aim: '8 連以上で効く' },
  { key: 'audio.bgm', label: 'BGM', value: true },
];
