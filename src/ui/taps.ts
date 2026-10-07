// タップ入力(ゲーム座標で受け取る)。itch.io のモバイル埋め込みでも落とさないよう、
// canvas / コンテナ / body / document に capture で多重に付け、同じイベントは 1 回だけ処理する。
// タッチは touchstart を正、マウスは pointerdown(touch を一度でも受けたら pointer 側のタッチは捨てる)。
import Phaser from 'phaser';
import { unlock } from '../core/audio';
import { isRotated } from './orient';

type Listener = (x: number, y: number) => void;
const listeners = new Set<Listener>();
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
      for (const tc of Array.from(te.changedTouches)) emit(tc.clientX, tc.clientY, 'touch:' + name);
    }, { capture: true, passive: false });
    t.addEventListener('pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (isUi(pe) || seen(pe)) return;
      if (pe.pointerType === 'touch' && sawTouch) return;
      emit(pe.clientX, pe.clientY, 'ptr:' + name);
    }, { capture: true });
  }
}

/** タップを受け取る。戻り値で解除 */
export function onTap(f: Listener): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
