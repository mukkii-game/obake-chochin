// WebAudio の合成音(ファイル不要)+ ミュート永続化 + 最初の操作で unlock。
// ファイル音源を使う場合は Phaser の this.sound を使い、ミュートは isMuted() を参照する。
import { load, save } from './save';

let ctx: AudioContext | null = null;
let muted = load().muted;
/** 効果音の出口(コンプレッサーと、うっすらした残響を通す) */
let bus: AudioNode | null = null;
let musicGain: GainNode | null = null;

function ensure(): AudioContext | null {
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
    buildBus(ctx);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** 夜の寺の境内くらいの残響(合成したインパルス応答)+ 音割れ防止のコンプレッサー */
function buildBus(c: AudioContext) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  comp.connect(c.destination);
  const dry = c.createGain(); dry.gain.value = 1;
  const wet = c.createGain(); wet.gain.value = 0.28;
  const conv = c.createConvolver();
  const len = Math.floor(c.sampleRate * 1.8);
  const ir = c.createBuffer(2, len, c.sampleRate);
  let s = 987654321;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * Math.pow(1 - i / len, 3.2); }
  }
  conv.buffer = ir;
  const input = c.createGain();
  input.connect(dry).connect(comp);
  input.connect(conv).connect(wet).connect(comp);
  bus = input;
  musicGain = c.createGain(); musicGain.gain.value = muted ? 0 : 1;
  musicGain.connect(c.destination);
}
const out = (c: AudioContext) => bus ?? c.destination;

/** 最初のタップ / キーで呼ぶ。以後 beep が鳴るようになる */
export function unlock() { ensure(); }

export function isMuted() { return muted; }
export function setMuted(m: boolean) { muted = m; save({ muted: m }); if (musicGain) musicGain.gain.value = m ? 0 : 1; }
export function toggleMuted() { setMuted(!muted); return muted; }

/** 短い合成音。freq Hz、dur 秒、type 波形 */
export function beep(freq = 440, dur = 0.08, type: OscillatorType = 'square', gain = 0.08) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

export const sfx = {
  tap: () => beep(880, 0.05),
  score: () => beep(1320, 0.08, 'triangle'),
  over: () => { beep(220, 0.25, 'sawtooth'); setTimeout(() => beep(110, 0.35, 'sawtooth'), 120); },
  ui: () => beep(660, 0.04, 'sine'),
};

/** 細かく指定できる合成音。delay 秒後に鳴らす。slide を付けると周波数がそこへ滑る */
export function tone(o: { freq: number; dur?: number; type?: OscillatorType; gain?: number; attack?: number; delay?: number; slide?: number }) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const dur = o.dur ?? 0.2, gain = o.gain ?? 0.08, atk = o.attack ?? 0.005;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out(c));
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 短いノイズ(紙が破れる・風・木を打つ音)。bandpass の中心 freq。slide を付けると中心が滑る */
export function noise(o: { dur?: number; gain?: number; freq?: number; q?: number; delay?: number; slide?: number; attack?: number }) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const dur = o.dur ?? 0.15;
  const t0 = c.currentTime + (o.delay ?? 0);
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * (1 - i / d.length); }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.setValueAtTime(o.freq ?? 1800, t0); f.Q.value = o.q ?? 0.8;
  if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
  const g = c.createGain();
  if (o.attack) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.gain ?? 0.1, t0 + o.attack); } else g.gain.value = o.gain ?? 0.1;
  src.connect(f).connect(g).connect(out(c));
  src.start(t0);
}

/** 音の時計。BGM の先読み予約に使う */
export function audioNow(): number | null { const c = ensure(); return c ? c.currentTime : null; }
/** 時刻指定で鳴らす(BGM 用)。at は audioNow() と同じ時計 */
export function toneAt(at: number, freq: number, dur: number, type: OscillatorType, gain: number) {
  if (muted || !ctx) return;
  const c = ctx;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(out(c));
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** 音楽ファイル(BGM)。読み込んで、途切れなくループする。ミュートは musicGain で */
const buffers = new Map<string, Promise<AudioBuffer | null>>();
export function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const c = ensure();
  if (!c) return Promise.resolve(null);
  if (!buffers.has(url)) {
    buffers.set(url, fetch(url).then((r) => r.arrayBuffer()).then((a) => new Promise<AudioBuffer | null>((res) => c.decodeAudioData(a, res, () => res(null)))).catch(() => null));
  }
  return buffers.get(url)!;
}
/** ループ再生。止める関数を返す。loopStart/loopEnd 秒(曲頭の無音や、曲尾の余白を飛ばす) */
export function playLoop(buf: AudioBuffer, gain: number, loopStart = 0, loopEnd = buf.duration, fadeIn = 1.5): () => void {
  const c = ensure();
  if (!c || !musicGain) return () => {};
  const src = c.createBufferSource();
  src.buffer = buf; src.loop = true; src.loopStart = loopStart; src.loopEnd = Math.min(loopEnd, buf.duration);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + fadeIn);
  src.connect(g).connect(musicGain);
  src.start(c.currentTime, loopStart);
  return () => {
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    src.stop(t + 0.85);
  };
}
