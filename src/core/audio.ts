// WebAudio の合成音(ファイル不要)+ ミュート永続化 + 最初の操作で unlock。
// ファイル音源を使う場合は Phaser の this.sound を使い、ミュートは isMuted() を参照する。
import { load, save } from './save';

let ctx: AudioContext | null = null;
let muted = load().muted;

function ensure(): AudioContext | null {
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** 最初のタップ / キーで呼ぶ。以後 beep が鳴るようになる */
export function unlock() { ensure(); }

export function isMuted() { return muted; }
export function setMuted(m: boolean) { muted = m; save({ muted: m }); }
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
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 短いノイズ(紙が破れる・風)。bandpass の中心 freq */
export function noise(o: { dur?: number; gain?: number; freq?: number; q?: number; delay?: number }) {
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
  f.type = 'bandpass'; f.frequency.value = o.freq ?? 1800; f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  g.gain.value = o.gain ?? 0.1;
  src.connect(f).connect(g).connect(c.destination);
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
  osc.connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}
