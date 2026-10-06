// 調整パネル。src/tuning.ts の KNOBS から自動で作る。作品ごとに中身(KNOBS)だけ差し替える。
// 直した値は端末に保存され、リロードしても残る。「戻す」で KNOBS の既定値へ。
import { KNOBS, Knob } from '../tuning';

const STORE = 'tuning:v1';
type V = number | string | boolean;
let saved: Record<string, V> = {};
try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { saved = {}; }

export function tune<T extends V = number>(key: string): T {
  if (key in saved) return saved[key] as T;
  const k = KNOBS.find((x) => x.key === key);
  if (!k) throw new Error(`tuning: 未登録のつまみ ${key}`);
  return k.value as T;
}

function set(key: string, v: V) {
  saved[key] = v;
  localStorage.setItem(STORE, JSON.stringify(saved));
}

function current() {
  return Object.fromEntries(KNOBS.map((k) => [k.key, tune(k.key)]));
}

let panel: HTMLDivElement | null = null;

function row(k: Knob): HTMLElement {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin:8px 0';
  const name = document.createElement('span');
  name.textContent = k.label + ('unit' in k && k.unit ? `(${k.unit})` : '');
  if (k.aim) name.title = k.aim;
  wrap.append(name);
  const v = tune<V>(k.key);
  if ('options' in k) {
    const sel = document.createElement('select');
    for (const o of k.options) sel.append(new Option(o, o, false, o === v));
    sel.onchange = () => set(k.key, sel.value);
    wrap.append(sel);
  } else if (typeof k.value === 'boolean') {
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = v as boolean;
    cb.onchange = () => set(k.key, cb.checked);
    wrap.append(cb);
  } else if ('min' in k) {
    const num = document.createElement('input');
    const sl = document.createElement('input');
    for (const el of [num, sl]) {
      el.min = String(k.min); el.max = String(k.max); el.step = String(k.step); el.value = String(v);
    }
    num.type = 'number'; num.style.width = '6em';
    sl.type = 'range'; sl.style.gridColumn = '1 / 3';
    num.oninput = () => { sl.value = num.value; set(k.key, Number(num.value)); };
    sl.oninput = () => { num.value = sl.value; set(k.key, Number(sl.value)); };
    wrap.append(num, sl);
  }
  if (k.aim) {
    const aim = document.createElement('small');
    aim.textContent = '狙い: ' + k.aim; aim.style.cssText = 'grid-column:1/3;opacity:.6';
    wrap.append(aim);
  }
  return wrap;
}

export function toggleTuning() {
  if (panel) { panel.remove(); panel = null; return; }
  panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:8px;right:8px;width:min(320px,90vw);max-height:90vh;overflow:auto;'
    + 'background:rgba(0,0,0,.85);color:#fff;font:14px sans-serif;padding:12px;border-radius:8px;z-index:9999';
  const head = document.createElement('div');
  head.innerHTML = '<b>調整</b> <small>(F2 で閉じる。多くの値は次のプレイから効く)</small>';
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;margin-top:8px';
  const copy = document.createElement('button');
  copy.textContent = 'コピー';
  copy.onclick = () => navigator.clipboard?.writeText(JSON.stringify(current(), null, 2));
  const reset = document.createElement('button');
  reset.textContent = '戻す';
  reset.onclick = () => { saved = {}; localStorage.removeItem(STORE); toggleTuning(); toggleTuning(); };
  btns.append(copy, reset);
  panel.append(head, ...KNOBS.map(row), btns);
  document.body.append(panel);
}

export function installTuning() {
  window.addEventListener('keydown', (e) => { if (e.key === 'F2') { e.preventDefault(); toggleTuning(); } });
  // スマホ: 左上の隅を 1 秒以内に 3 回タップ
  let taps: number[] = [];
  window.addEventListener('pointerdown', (e) => {
    if (e.clientX > 60 || e.clientY > 60) return;
    const now = performance.now();
    taps = [...taps.filter((t) => now - t < 1000), now];
    if (taps.length >= 3) { taps = []; toggleTuning(); }
  });
  (window as unknown as { __tuning: unknown }).__tuning = { tune, current, toggle: toggleTuning };
}
