// この作品の効果音と BGM。
// 効果音は WebAudio の合成(和の楽器に寄せる: 太鼓・鈴・拍子木・寺の鐘・篠笛の息)。core/audio の残響を通る。
// BGM は魔王魂(CC BY 4.0、表記: 音楽：魔王魂)。遊ぶ間 = サイバー16(アイドル・ダンスの曲)。タイトルは無音。
// 始まりの声「おばけが、くるぞー!」は Open JTalk + HTS Voice「Mei」(happy, CC BY 3.0)で作った。
// 読めない時は合成の爪弾きに切り替える。
import { tone, noise, audioNow, toneAt, isMuted, loadBuffer, playLoop, voice, playSample, setVolumes } from '../core/audio';
import { tune } from '../core/tuning';

// 都節音階(D E♭ G A B♭)。和の夜の響き
const SCALE = [293.66, 311.13, 392.0, 440.0, 466.16];
const note = (i: number) => SCALE[((i % 5) + 5) % 5] * 2 ** Math.floor(i / 5);

/** 鈴(りん): 金属の、倍音が整数倍でない澄んだ音 */
function rin(freq: number, gain = 0.05, delay = 0, dur = 1.2) {
  tone({ freq, dur, type: 'sine', gain, delay });
  tone({ freq: freq * 2.71, dur: dur * 0.45, type: 'sine', gain: gain * 0.4, delay });
  tone({ freq: freq * 5.12, dur: dur * 0.18, type: 'sine', gain: gain * 0.18, delay });
}
/** きれいな高い鐘(ピン・ポン): 明るい倍音のベル + 「パ」のきらめき */
function chime(freq: number, gain = 0.06, delay = 0, dur = 0.9) {
  tone({ freq, dur, type: 'sine', gain, delay, attack: 0.002 });
  tone({ freq: freq * 2, dur: dur * 0.6, type: 'sine', gain: gain * 0.45, delay, attack: 0.002 });
  tone({ freq: freq * 3.01, dur: dur * 0.3, type: 'sine', gain: gain * 0.25, delay, attack: 0.002 });
  tone({ freq: freq * 4.2, dur: dur * 0.15, type: 'triangle', gain: gain * 0.15, delay, attack: 0.001 });
  noise({ dur: 0.08, gain: gain * 0.5, freq: 7000, q: 1.2, delay });
}
/** 明るい音階(長調の五音)。連爆の n 個目ほど上がる */
const BRIGHT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const brightNote = (k: number) => 880 * 2 ** (BRIGHT[Math.min(k, BRIGHT.length - 1)] / 12);

/** 寺の鐘: 低く長い。少しずれた音が重なってうなる */
function kane(freq: number, gain = 0.08, delay = 0, dur = 3.5) {
  tone({ freq, dur, type: 'sine', gain, delay, attack: 0.01 });
  tone({ freq: freq * 1.006, dur, type: 'sine', gain: gain * 0.7, delay, attack: 0.01 });
  tone({ freq: freq * 2.42, dur: dur * 0.5, type: 'sine', gain: gain * 0.35, delay });
  tone({ freq: freq * 3.9, dur: dur * 0.25, type: 'sine', gain: gain * 0.15, delay });
  noise({ dur: 0.05, gain: gain * 0.6, freq: 1200, q: 3, delay });
}
/** 太鼓: 皮の低い胴鳴り(音程が下がる)+ 撥の当たり */
function taiko(gain = 0.16, delay = 0, freq = 95) {
  tone({ freq: freq * 1.6, slide: freq, dur: 0.35, type: 'sine', gain, delay, attack: 0.002 });
  tone({ freq: freq * 0.5 * 1.6, slide: freq * 0.5, dur: 0.5, type: 'sine', gain: gain * 0.6, delay, attack: 0.003 });
  noise({ dur: 0.06, gain: gain * 0.5, freq: 900, q: 0.7, delay });
}
/** 拍子木 / 木魚: 乾いた木の音 */
function wood(freq = 1800, gain = 0.07, delay = 0) {
  noise({ dur: 0.04, gain, freq, q: 9, delay });
  tone({ freq: freq * 0.5, dur: 0.05, type: 'triangle', gain: gain * 0.5, delay, attack: 0.001 });
}
/** 篠笛の息のような、ふわっと上がる風 */
function breath(from: number, to: number, dur: number, gain = 0.05, delay = 0) {
  noise({ dur, gain, freq: from, slide: to, q: 4, delay, attack: dur * 0.3 });
}

export const snd = {
  /** 下がった提灯が灯った: 風鈴 */
  place: () => { rin(note(12), 0.03, 0, 0.9); rin(note(14), 0.02, 0.09, 0.7); },
  /** 投げた: 息が上がる + 小さな提灯の揺れ */
  // 置き場所を決めて投げた: カメラのシャッターのような「カチャッ」(2 つの短い金属音)+ ふわっと飛ぶ息
  launch: () => { noise({ dur: 0.025, gain: 0.09, freq: 3200, q: 4 }); noise({ dur: 0.04, gain: 0.07, freq: 2200, q: 3, delay: 0.06 }); tone({ freq: 2400, dur: 0.03, type: 'square', gain: 0.015, delay: 0.06 }); breath(500, 1600, 0.35, 0.04); },
  /** 下げる: 拍子木 2 打 */
  arm: () => { wood(2100, 0.08); wood(2300, 0.08, 0.13); },
  /** おばけが見とれて止まった: 小さな木魚 */
  catch: () => wood(900, 0.05),
  /** おばけが家に入った: ひゅ〜どろどろ */
  haunt: () => {
    tone({ freq: 1250, slide: 520, dur: 0.7, type: 'sine', gain: 0.04, attack: 0.08 });
    tone({ freq: 1262, slide: 525, dur: 0.7, type: 'sine', gain: 0.03, attack: 0.08 });
    taiko(0.06, 0.55, 70); taiko(0.05, 0.72, 66);
  },
  saved: () => [0, 2, 4].forEach((k, i) => rin(note(7 + k), 0.04, i * 0.07, 1)),
  deny: () => wood(500, 0.05),
  /**
   * 提灯が弾けた: ばしゅーん(Kenney の CC0 音を 2 つ重ねたもの)+ 太鼓。
   * 連爆の n 個目ほど、都節の音階で高くなる(5 個目で 1 オクターブ上)。読めない時は合成だけ
   */
  break: (n: number) => {
    const step = MIYAKO[Math.min(n - 1, MIYAKO.length - 1)];
    if (boomBuf) playSample(boomBuf, n > 1 ? 0.3 : 0.42, 2 ** (step / 12));
    else noise({ dur: 0.25, gain: 0.07, freq: 3200, slide: 1500, q: 0.6 });
    taiko(n > 1 ? 0.08 : 0.12, 0, 95 * 2 ** (step / 12));
    // 連爆: ピン・ポン・パーン…と、高くてきれいな鐘が明るい音階で上がっていく
    if (n > 1) chime(brightNote(n - 2), 0.07, 0, 1.1);
  },
  burnout: () => noise({ dur: 0.4, gain: 0.06, freq: 600, q: 2 }),
  /** n 体目の成仏: 鈴が音階を上っていく */
  purify: (n: number) => rin(note(6 + Math.min(n - 1, 12)), 0.045, 0, 1.0),
  wispPop: () => rin(note(12), 0.02, 0, 0.4),
  chainEnd: (n: number) => {
    // 3 体以上まとめて: 締めの「ピンポンパーン!」(高 → 低 → いちばん高く長く)
    if (n >= 3) { chime(1318.5, 0.06, 0.05, 0.6); chime(1046.5, 0.06, 0.2, 0.6); chime(1568, 0.075, 0.38, 1.6); chime(2093, 0.04, 0.38, 1.4); }
    if (n < 4) return;
    [0, 2, 4, 7].forEach((k, i) => rin(note(10 + k), 0.04, i * 0.08, 1.6));
    if (n >= 6) kane(note(0) / 2, 0.05, 0.3, 2.5);
  },
  // 家がやられた: 除夜の鐘のように「ごーん」(低い鐘 + 撞木の当たり + うなり)
  houseOut: () => { taiko(0.08, 0, 50); kane(72, 0.16, 0, 5); kane(72.6, 0.08, 0, 5); },
  // 発射位置ロック: カチッ + ピン↑ / ロック解除: カチッ + ピン↓
  lock: () => { wood(1700, 0.06); tone({ freq: 880, dur: 0.12, type: 'triangle', gain: 0.05, delay: 0.02 }); tone({ freq: 1320, dur: 0.22, type: 'triangle', gain: 0.05, delay: 0.09 }); },
  unlock: () => { wood(1300, 0.05); tone({ freq: 1320, dur: 0.1, type: 'triangle', gain: 0.04, delay: 0.02 }); tone({ freq: 740, dur: 0.2, type: 'triangle', gain: 0.04, delay: 0.08 }); },
  relight: () => [0, 1, 2, 3, 4].forEach((k, i) => rin(note(10 + k), 0.04, i * 0.07, 1.2)),
  /** 刻の始まり: 寺の鐘 */
  watch: () => kane(note(0) / 2, 0.08),
  over: () => { kane(note(0) / 2, 0.09, 0, 4); kane(note(0) / 2, 0.07, 1.6, 4); },
  ui: () => wood(1500, 0.05),
  /** 大入道に光が当たった: ぼよん */
  hurt: () => { tone({ freq: 180, slide: 320, dur: 0.18, type: 'sine', gain: 0.1 }); tone({ freq: 320, slide: 160, dur: 0.22, type: 'triangle', gain: 0.06, delay: 0.12 }); },
  /** 逃げる人の叫び声(合成)。kind: 0 = キャー(高い)/ 1 = ワー(低め)/ 2 = ひぃ〜(息まじり) */
  scream: (kind: number, delay = 0, pitch = 1) => {
    if (kind === 0) voice({ delay, dur: 0.75, gain: 0.05, consonant: 0.04, vibrato: 18,
      pitch: [[0, 620 * pitch], [0.12, 980 * pitch], [0.5, 900 * pitch], [0.75, 560 * pitch]],
      f1: [[0, 350], [0.1, 850], [0.75, 800]], f2: [[0, 2300], [0.1, 1300], [0.75, 1200]] });
    else if (kind === 1) voice({ delay, dur: 0.8, gain: 0.055, vibrato: 12,
      pitch: [[0, 220 * pitch], [0.15, 330 * pitch], [0.55, 310 * pitch], [0.8, 200 * pitch]],
      f1: [[0, 320], [0.18, 780], [0.8, 720]], f2: [[0, 700], [0.18, 1150], [0.8, 1100]] });
    else { noise({ dur: 0.5, gain: 0.03, freq: 2600, q: 2, delay });
      voice({ delay: delay + 0.05, dur: 0.6, gain: 0.03, vibrato: 25,
        pitch: [[0, 700 * pitch], [0.6, 480 * pitch]], f1: [[0, 300], [0.6, 300]], f2: [[0, 2400], [0.6, 2200]] }); }
  },
};

/** 都節音階の半音(0 = 元の高さ、12 = 1 オクターブ上) */
const MIYAKO = [0, 1, 5, 7, 8, 12, 13, 17, 19, 20, 24];
let boomBuf: AudioBuffer | null = null;
let voObake: AudioBuffer | null = null;
/** やられた時のおばけの声(Open JTalk + Mei、高め) */
const CRIES = ['yarareta', 'hya', 'uwaan', 'kyuu', 'maitta'];
const cryBufs = new Map<string, AudioBuffer>();
let lastCry = 0, cryTurn = 0;
/** 効果音のファイルを読んでおく(遊ぶ前に 1 回) */
export function preloadSfx() {
  if (!boomBuf) loadBuffer('./audio/se_boom.mp3').then((b) => { boomBuf = b; });
  if (!voObake) loadBuffer('./audio/vo_obake.mp3').then((b) => { voObake = b; });
  if (!cryBufs.size) for (const n of CRIES) loadBuffer(`./audio/vo_${n}.mp3`).then((b) => { if (b) cryBufs.set(n, b); });
}
/** おばけがやられた声。たくさん同時に倒れても、うるさくならないように間を空ける(声の高さを少しずつ変える) */
export function cry(n: number): string | null {
  const now = audioNow();
  if (now == null || !cryBufs.size || now - lastCry < 0.16) return null;
  const name = CRIES[cryTurn++ % CRIES.length];
  const buf = cryBufs.get(name);
  if (!buf) return null;
  lastCry = now;
  // やられた声は爆発より大きく(いちばん楽しい音)
  playSample(buf, 1.1, 1 + Math.min(n - 1, 8) * 0.04 + (cryTurn % 3) * 0.03);
  return name;
}

/** 始まりの声「おばけが、くるぞー!」 */
export function sayObake() { if (voObake) playSample(voObake, 0.9); }

/** 曲ごとのループ点(曲頭の無音を飛ばし、拍の推定から小節の切れ目で戻す。ffmpeg の silencedetect と拍の自己相関で決めた) */
const TRACKS = {
  // bpm と最初の拍(秒)は、音の立ち上がりの自己相関で測った(おばけが拍に合わせて弾む)
  play: { url: './audio/bgm_play.mp3', start: 0.52, end: 57.985, gain: 0.3, bpm: 152, firstBeat: 0.717 },
} as const;
export type Track = keyof typeof TRACKS;
let stopFile: (() => void) | null = null;
let starting = false;
let gen = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let next = 0;
let stepI = 0;
let intensity = 0;
const PHRASE = [0, 2, 3, 2, 5, 4, 3, -1, 2, 3, 5, 7, 6, 5, 3, -1];

let current: Track | null = null;
/** 曲が鳴り始めた時刻(音の時計) */
let playT0: number | null = null;
/**
 * いまの拍の位置(拍の数。小数部が拍の中の位置)。曲が鳴っていれば曲の位置から、鳴っていなければ同じテンポの時計で。
 * 絵(おばけが弾む)を BGM に合わせるために使う
 */
export function beatPos(fallbackSec: number): number {
  const tr = TRACKS.play, beat = 60 / tr.bpm;
  const now = audioNow();
  if (playT0 != null && now != null && current === 'play' && stopFile) {
    const len = tr.end - tr.start;
    const pos = tr.start + (((now - playT0) % len) + len) % len;
    return (pos - tr.firstBeat) / beat;
  }
  return fallbackSec / beat;
}
export function bgmStart(track: Track = 'play') {
  setVolumes(tune<number>('audio.sfx'), tune<number>('audio.music'));
  if (current === track && (stopFile || starting || timer)) return;
  bgmStop();
  if (!tune<boolean>('audio.bgm')) return;
  current = track;
  starting = true;
  const my = ++gen;
  const tr = TRACKS[track];
  loadBuffer(tr.url).then((buf) => {
    if (my !== gen) return; // 読んでいる間に止められた
    starting = false;
    if (stopFile || timer) return;
    if (buf) { stopFile = playLoop(buf, tr.gain, tr.start, tr.end); playT0 = audioNow(); }
    else synthStart();
  });
}

/** 合成の爪弾き(曲ファイルが読めない時) */
function synthStart() {
  const now = audioNow();
  if (now == null) return;
  next = now + 0.1; stepI = 0;
  timer = setInterval(() => {
    const t = audioNow();
    if (t == null) return;
    if (next < t - 0.3) next = t + 0.05;
    const beat = 0.42 - intensity * 0.08;
    while (next < t + 0.25) {
      if (!isMuted()) {
        const p = PHRASE[stepI % PHRASE.length];
        if (p >= 0) toneAt(next, note(p + (stepI >> 4) % 2 * 2), 0.9, 'triangle', 0.028);
        if (stepI % 8 === 0) toneAt(next, note(0) / 2, 3.2, 'sine', 0.035);
      }
      next += beat; stepI++;
    }
  }, 60);
}
/** 0..1。夜が更けるほど(合成の時だけ)少し速く */
export function bgmIntensity(v: number) { intensity = Math.max(0, Math.min(1, v)); }
export function bgmStop() {
  starting = false; gen++; current = null;
  if (stopFile) { stopFile(); stopFile = null; }
  if (timer) clearInterval(timer); timer = null;
}
