// タップ入力(ゲーム座標で受け取る)。itch.io のモバイル埋め込みでも落とさないよう、
// canvas / コンテナ / body / document に capture で多重に付け、同じイベントは 1 回だけ処理する。
// タッチは touchstart を正、マウスは pointerdown(touch を一度でも受けたら pointer 側のタッチは捨てる)。
import Phaser from 'phaser';
import { unlock } from '../core/audio';
import { isRotated } from './orient';

type Listener = (x: number, y: number) => void;
const listeners = new Set<Listener>();
/** 狙い: 押した(down)・動かした(move。マウスはボタンを押さずに動かしても hover)・離した(up) */
export type AimPhase = 'down' | 'move' | 'hover' | 'up';
type AimListener = (phase: AimPhase, x: number, y: number) => void;
const aimListeners = new Set<AimListener>();
let pressed = false;
export const tapStats: Record<string, number> = {};
export let lastTap = { x: 0, y: 0, src: '' };
let game: Phaser.Game | null = null;
let sawTouch = false;

function seen(e: Event): boolean {
  const ev = e as Event & { __seen?: boolean };
  if (ev.__seen) return true;
  ev.__seen = true;
  return false;
}

function toGame(clientX: number, clientY: number): [number, number] | null {
  if (!game) return null;
  const cv = game.canvas;
  let r = cv.getBoundingClientRect();
  if (!r.width || !r.height) r = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  let x: number, y: number;
  if (isRotated()) {
    // 90 度回している: ゲームの x は画面の下向き、y は画面の左向き
    x = ((clientY - r.top) / r.height) * game.scale.width;
    y = ((r.right - clientX) / r.width) * game.scale.height;
  } else {
    x = ((clientX - r.left) / r.width) * game.scale.width;
    y = ((clientY - r.top) / r.height) * game.scale.height;
  }
  if (x < -20 || y < -20 || x > game.scale.width + 20 || y > game.scale.height + 20) return null;
  return [x, y];
}

function emit(clientX: number, clientY: number, src: string) {
  tapStats[src] = (tapStats[src] ?? 0) + 1;
  unlock();
  const p = toGame(clientX, clientY);
  if (!p) return;
  lastTap = { x: Math.round(p[0]), y: Math.round(p[1]), src };
  for (const f of [...listeners]) f(p[0], p[1]);
}

function emitAim(phase: AimPhase, clientX: number, clientY: number) {
  if (!aimListeners.size) return;
  const p = toGame(clientX, clientY);
  if (!p) { if (phase === 'up') for (const f of [...aimListeners]) f('up', NaN, NaN); return; }
  for (const f of [...aimListeners]) f(phase, p[0], p[1]);
}

function isUi(e: Event) {
  const t = e.target as HTMLElement | null;
  return !!t?.closest?.('[data-ui]');
}

export function installTaps(g: Phaser.Game) {
  game = g;
  const targets: Array<[EventTarget, string]> = [
    [g.canvas, 'canvas'], [g.canvas.parentElement ?? document.body, 'box'], [document.body, 'body'], [document, 'doc'],
  ];
  for (const [t, name] of targets) {
    t.addEventListener('touchstart', (e) => {
      const te = e as TouchEvent;
      if (isUi(te) || seen(te)) return;
      sawTouch = true;
      te.preventDefault();
      for (const tc of Array.from(te.changedTouches)) { emit(tc.clientX, tc.clientY, 'touch:' + name); emitAim('down', tc.clientX, tc.clientY); }
      pressed = true;
    }, { capture: true, passive: false });
    t.addEventListener('touchmove', (e) => {
      const te = e as TouchEvent;
      if (isUi(te) || seen(te)) return;
      te.preventDefault();
      const tc = te.changedTouches[0];
      if (tc) emitAim('move', tc.clientX, tc.clientY);
    }, { capture: true, passive: false });
    for (const ev of ['touchend', 'touchcancel']) {
      t.addEventListener(ev, (e) => {
        const te = e as TouchEvent;
        if (seen(te) || !pressed) return;
        pressed = false;
        const tc = te.changedTouches[0];
        if (tc && ev === 'touchend') emitAim('up', tc.clientX, tc.clientY); else emitAim('up', NaN, NaN);
      }, { capture: true });
    }
    t.addEventListener('pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (isUi(pe) || seen(pe)) return;
      if (pe.pointerType === 'touch' && sawTouch) return;
      emit(pe.clientX, pe.clientY, 'ptr:' + name);
      emitAim('down', pe.clientX, pe.clientY);
      pressed = true;
    }, { capture: true });
    t.addEventListener('pointermove', (e) => {
      const pe = e as PointerEvent;
      if (seen(pe) || (pe.pointerType === 'touch' && sawTouch)) return;
      emitAim(pressed ? 'move' : 'hover', pe.clientX, pe.clientY);
    }, { capture: true });
    t.addEventListener('pointerup', (e) => {
      const pe = e as PointerEvent;
      if (seen(pe) || (pe.pointerType === 'touch' && sawTouch) || !pressed) return;
      pressed = false;
      emitAim('up', pe.clientX, pe.clientY);
    }, { capture: true });
  }
}

/** タップを受け取る。戻り値で解除 */
export function onTap(f: Listener): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 狙い(押す・動かす・離す)を受け取る。ゲームの場で「離した所へ投げる」に使う。戻り値で解除 */
export function onAim(f: AimListener): () => void {
  aimListeners.add(f);
  return () => aimListeners.delete(f);
}
