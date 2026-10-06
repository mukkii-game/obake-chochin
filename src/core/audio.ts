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
