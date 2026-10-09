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
  // 家(= 光の形)。最初は縦と横の 2 つだけ
  { key: 'piece.set', label: '家(提灯)の種類', value: '縦・横・丸', options: ['縦・横・丸', '縦・横', '上・下・丸'], aim: '家の形 = 提灯の形 = 光の形。どの形も必ず 1 軒、どこに建つかは毎回変わる' },
  // 提灯(基本は時限: 着いたら弾ける。飛んでいる間にもう一度押すと下がって待つ)
  { key: 'lantern.max', label: '同時に出せる提灯(1 日目。日ごとに +1)', value: 3, min: 1, max: 6, step: 1, unit: '個', aim: '飛んでいるもの・下がっているものを数える' },
  { key: 'lantern.perHouse', label: '1 軒の軒先の提灯', value: 3, min: 1, max: 6, step: 1, unit: '個' },
  { key: 'lantern.regen', label: '軒先の提灯が 1 つ戻るまで', value: 6, min: 0.5, max: 20, step: 0.5, unit: '秒', aim: '使い切っても待てば戻る(弾切れで何もできなくならない)' },
  { key: 'lantern.speed', label: '提灯の飛ぶ速さ', value: 140, min: 60, max: 800, step: 10, unit: 'px/秒', aim: 'ゆっくり。着くまでの間を読む(ミサイルコマンドの弾)' },
  { key: 'lantern.catch', label: '置いた提灯に見とれる近さ', value: 20, min: 4, max: 80, step: 1, unit: 'px' },
  { key: 'lantern.lure', label: '提灯に寄ってくる距離', value: 0, min: 0, max: 160, step: 5, unit: 'px', aim: 'この距離を通るおばけは置かれた提灯へ寄って止まる(寄せ集めてまとめて弾く攻略)。0 で寄らない' },
  { key: 'lantern.lureSpeed', label: '提灯へ寄る速さ(倍)', value: 0.8, min: 0.2, max: 2, step: 0.1, unit: '倍', aim: 'ふらふら寄る感じ' },
  { key: 'lantern.grab', label: '提灯を押したとみなす近さ', value: 26, min: 8, max: 60, step: 1, unit: 'px', aim: '提灯のこれだけ近くには重ねて投げられない' },
  { key: 'lantern.fuse', label: '置いた提灯が弾けるまで', value: 3, min: 0.5, max: 10, step: 0.1, unit: '秒', aim: 'ボンバーマン。光が届いた提灯はすぐ弾ける(誘爆)ので、つなぐために置く手もある' },
  // 光
  { key: 'light.line', label: '縦・横の光の長さ(中心から)', value: 72, min: 20, max: 400, step: 4, unit: 'px', aim: '最初はポーンより少し先まで。遠くへは提灯を並べて誘爆でつなぐ' },
  { key: 'light.width', label: '縦・横の光の太さ', value: 30, min: 8, max: 120, step: 2, unit: 'px' },
  { key: 'light.area', label: '丸の光の半径', value: 56, min: 16, max: 200, step: 4, unit: 'px' },
  { key: 'light.dayGrow', label: '日ごとに光が広がる割合', value: 0.5, min: 0, max: 0.6, step: 0.05, unit: '倍', aim: '2 日目は 1.5 倍、3 日目は 2 倍の長さ・広さ(置ける数は増えない)' },
  { key: 'house.carry', label: '次の日に灯る家 = 守った家 + この数', value: 9, min: 0, max: 9, step: 1, unit: '軒', aim: '前の日の出来が響く。9 で毎日ぜんぶ灯る' },
  { key: 'light.speed', label: '光の伸びる速さ', value: 150, min: 20, max: 800, step: 10, unit: 'px/秒', aim: 'ゆっくり伸びる。伸びる先におばけが来る時を読む' },
  { key: 'light.hold', label: '光が 1 か所を照らす時間', value: 0.7, min: 0.1, max: 3, step: 0.1, unit: '秒', aim: '光は帯になって伸びる。どこも同じ間だけ照らされる' },
  { key: 'chain.relightAt', label: '家の灯りが戻る連鎖数', value: 12, min: 3, max: 30, step: 1, unit: '連' },
  { key: 'score.base', label: '1体の基本点', value: 10, min: 1, max: 100, step: 1, unit: '点', aim: '1 回の光(と誘爆)の n 体目は基本点 × n' },
  { key: 'score.chain', label: '連鎖ボーナス', value: 160, min: 0, max: 500, step: 10, unit: '点×(n-2)²', aim: '3 連以上' },
  { key: 'score.net', label: '提灯の網の倍率(弾けた提灯 1 つごと)', value: 0, min: 0, max: 2, step: 0.1, unit: '倍', aim: '提灯をつないで網にするほど、その連鎖の点が全部増える(置き方を考える理由)' },
  { key: 'score.big', label: '大入道の点の倍率', value: 5, min: 1, max: 20, step: 1, unit: '倍' },
  { key: 'score.giant', label: '大大入道の点の倍率', value: 12, min: 1, max: 50, step: 1, unit: '倍' },
  { key: 'score.mega', label: '特大入道の点の倍率', value: 25, min: 1, max: 60, step: 1, unit: '倍', aim: '倒した時のごほうび' },
  { key: 'score.formation', label: '編隊ボーナス', value: 40, min: 0, max: 1000, step: 10, unit: '点×数×刻', aim: '一緒に来た群れを、一度の光(と誘爆)で全部倒した時' },
  // 家
  // おばけ(動きは種類ごとに決まっている)
  { key: 'ghost.speed', label: 'おばけの速さ', value: 32, min: 8, max: 100, step: 1, unit: 'px/秒', aim: '上から家まで約 18 秒' },
  { key: 'ghost.loop', label: '鬼火の輪の半径', value: 38, min: 10, max: 120, step: 2, unit: 'px', aim: '輪を描く間は丸の光が有利' },
  { key: 'ghost.bigHp', label: '大入道の力', value: 5, min: 1, max: 12, step: 1, unit: '回', aim: '光が当たるたびに減って、顔と色が変わる(数字は出さない)' },
  { key: 'ghost.giantHp', label: '大大入道の力', value: 9, min: 1, max: 20, step: 1, unit: '回' },
  { key: 'ghost.megaHp', label: '特大入道の力(光何回で成仏)', value: 18, min: 3, max: 40, step: 1, unit: '回', aim: 'ときどき来る、いちばん大きな敵。コンボの力で削る' },
  { key: 'ghost.queue', label: 'つかえたおばけの間', value: 18, min: 6, max: 60, step: 1, unit: 'px', aim: '止まったおばけのこれだけ手前で、後ろのおばけも止まる(せき止め)' },
  { key: 'ghost.last', label: '最後の一匹・一隊列の速さ(倍)', value: 2, min: 1, max: 4, step: 0.1, unit: '倍', aim: 'インベーダーのように、残りが 1 匹か 1 つの隊列だけになったら急いで来る' },
  { key: 'fever.at', label: 'あせる時間が始まる(刻が始まってから)', value: 9, min: 0, max: 30, step: 0.5, unit: '秒', aim: '第二・第三刻の途中で、おばけも曲も速くなる' },
  { key: 'fever.dur', label: 'あせる時間の長さ', value: 6, min: 0, max: 20, step: 0.5, unit: '秒' },
  { key: 'fever.mult', label: 'あせる時間の速さ(倍)', value: 1.3, min: 1, max: 2, step: 0.05, unit: '倍', aim: '曲も同じ倍率で速くなる' },
  { key: 'fever.every', label: 'あせる時間のくり返し(秒ごと。0 = 1 刻に 1 回)', value: 15, min: 0, max: 40, step: 1, unit: '秒', aim: '短いほど頻繁にあせる(難しさのつまみ)' },
  { key: 'fever.fromHour', label: 'あせる時間がある刻(何番目の刻から)', value: 0, min: 0, max: 2, step: 1, unit: '番目', aim: '0 = 第一刻から、1 = 第二刻から' },
  { key: 'ghost.dashR', label: '家に飛び込み始める距離', value: 70, min: 0, max: 160, step: 5, unit: 'px', aim: '家のすぐ近くで、すうっと速くなる' },
  { key: 'ghost.dash', label: '家に飛び込む速さ(倍)', value: 2.2, min: 1, max: 4, step: 0.1, unit: '倍', aim: '最後の一押しの勢い。大きいほど直前の救出が難しい' },
  { key: 'chain.delay', label: '誘爆の間(火が付いてから弾けるまで)', value: 0.2, min: 0, max: 0.6, step: 0.02, unit: '秒', aim: 'ぴん、ぽん、ぱーん! と 1 つずつ弾ける気持ちよさ。0 で一気に' },
  { key: 'chain.grow', label: 'コンボ 1 発ごとに光が大きくなる割合', value: 0.12, min: 0, max: 0.4, step: 0.02, unit: '倍', aim: 'つなぐほど光が広がる(4 段まで)。力は 3 発目で 2、5 発目で 3' },
  { key: 'chain.pad', label: '連鎖の当たりの余裕(見えている縁)', value: 12, min: 0, max: 30, step: 1, unit: 'px', aim: '光の範囲の縁どうしが触れているだけで連鎖する' },
  { key: 'ghost.kaze', label: 'はやて(速いおばけ)の速さ', value: 2.1, min: 1, max: 4, step: 0.1, unit: '倍', aim: '先読みを強く求める' },
  { key: 'ghost.side', label: '横から来る組の速さ', value: 1.3, min: 1, max: 3, step: 0.1, unit: '倍', aim: '家までの道のりが長いぶん速く' },
  { key: 'ghost.inazuma', label: 'いなずま(すごく速いおばけ)の速さ', value: 4.2, min: 2, max: 8, step: 0.1, unit: '倍', aim: '家へまっすぐ来ないぶん、うんと速く' },
  { key: 'ghost.zigLen', label: 'いなずまが家へ向かうまでに走る道のり', value: 1500, min: 400, max: 3000, step: 50, unit: 'px', aim: '速さ × 道のりで、倒すまでの猶予がほかと同じくらいになるように' },
  { key: 'ghost.march', label: '行進が 1 段で下がる高さ', value: 46, min: 20, max: 120, step: 2, unit: 'px', aim: 'インベーダーのように、端で下がる' },
  // 刻
  { key: 'wave.bonus', label: '刻を越えた時の 1 軒あたりの点', value: 50, min: 0, max: 500, step: 10, unit: '点×刻' },
  // 演出
  { key: 'juice.shake', label: '家の灯りが消えた時の揺れ', value: 0.012, min: 0, max: 0.05, step: 0.002, unit: '画面比' },
  { key: 'juice.hitstop', label: '大連鎖の一瞬の止まり', value: 60, min: 0, max: 200, step: 10, unit: 'ms', aim: '6 連以上で効く' },
  { key: 'audio.bgm', label: 'BGM', value: true },
  { key: 'audio.sfx', label: '効果音の音量', value: 0.45, min: 0, max: 1, step: 0.05, aim: 'AI は聴かずに音量を決めるので大きめになりがち。控えめから' },
  { key: 'audio.music', label: 'BGM の音量', value: 0.28, min: 0, max: 1, step: 0.05 },
];
