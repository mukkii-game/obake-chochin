// この作品の効果音と BGM(すべて WebAudio の合成音。ファイルなし)。
import { tone, noise, audioNow, toneAt, isMuted } from '../core/audio';
import { tune } from '../core/tuning';

// 都節音階(D E♭ G A B♭)。和の夜の響き
const SCALE = [293.66, 311.13, 392.0, 440.0, 466.16];
const note = (i: number) => SCALE[((i % 5) + 5) % 5] * 2 ** Math.floor(i / 5);

/** 鈴(りん)っぽい音。倍音を少し足す */
function bell(freq: number, gain = 0.06, delay = 0, dur = 0.9) {
  tone({ freq, dur, type: 'sine', gain, delay });
  tone({ freq: freq * 2.76, dur: dur * 0.4, type: 'sine', gain: gain * 0.35, delay });
}

export const snd = {
  place: () => { tone({ freq: 520, slide: 300, dur: 0.12, type: 'triangle', gain: 0.09 }); bell(note(7), 0.025, 0.03, 0.4); },
  launch: () => { noise({ dur: 0.18, gain: 0.07, freq: 900, q: 1.2 }); tone({ freq: 300, slide: 700, dur: 0.16, type: 'triangle', gain: 0.05 }); },
  arm: () => { tone({ freq: 1400, dur: 0.05, type: 'square', gain: 0.03 }); tone({ freq: 1800, dur: 0.05, type: 'square', gain: 0.03, delay: 0.06 }); },
  catch: () => tone({ freq: 700, slide: 1000, dur: 0.07, type: 'sine', gain: 0.025 }),
  deny: () => tone({ freq: 160, dur: 0.12, type: 'square', gain: 0.04 }),
  break: (held: number) => {
    noise({ dur: 0.22, gain: 0.16, freq: 2400, q: 0.6 });
    tone({ freq: 180, slide: 60, dur: 0.25, type: 'sine', gain: 0.12 });
    if (held > 0) bell(note(10), 0.05, 0.02, 1.2);
  },
  burnout: () => noise({ dur: 0.4, gain: 0.06, freq: 600, q: 2 }),
  /** n 連目。音階を上っていく */
  purify: (n: number) => bell(note(5 + Math.min(n - 1, 14)), 0.045, 0, 0.6),
  wispPop: () => tone({ freq: 1200, slide: 1800, dur: 0.08, type: 'sine', gain: 0.025 }),
  chainEnd: (n: number) => {
    if (n < 5) return;
    [0, 2, 4, 7].forEach((k, i) => bell(note(10 + k), 0.04, i * 0.07, 1.4));
  },
  houseOut: () => { tone({ freq: 110, slide: 50, dur: 0.5, type: 'sawtooth', gain: 0.06 }); noise({ dur: 0.5, gain: 0.08, freq: 300, q: 1 }); },
  relight: () => [0, 1, 2, 3, 4].forEach((k, i) => bell(note(10 + k), 0.04, i * 0.06, 1)),
  watch: () => { bell(note(0) / 2, 0.08, 0, 2.2); bell(note(0) / 2, 0.05, 1.1, 2.0); },
  over: () => { [4, 2, 1, 0].forEach((k, i) => bell(note(k), 0.05, i * 0.25, 1.6)); },
  ui: () => tone({ freq: 880, dur: 0.06, type: 'sine', gain: 0.05 }),
};

/** BGM: ゆっくりした琴っぽい爪弾き + 低い持続音。オーディオ時計で先読み予約する */
let timer: ReturnType<typeof setInterval> | null = null;
let next = 0;
let stepI = 0;
let intensity = 0;
const PHRASE = [0, 2, 3, 2, 5, 4, 3, -1, 2, 3, 5, 7, 6, 5, 3, -1];

export function bgmStart() {
  if (timer || !tune<boolean>('audio.bgm')) return;
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
        if (intensity > 0.5 && stepI % 2 === 1) toneAt(next, note(p + 5 > 0 ? p + 5 : 5), 0.15, 'sine', 0.012);
      }
      next += beat; stepI++;
    }
  }, 60);
}
/** 0..1。夜が更けるほど少し速く、細かく */
export function bgmIntensity(v: number) { intensity = Math.max(0, Math.min(1, v)); }
export function bgmStop() { if (timer) clearInterval(timer); timer = null; }
