// 名前空間つき localStorage。DEFAULTS とマージ、版番号、try/catch。
const NS = 'game-template'; // 作品ごとに変える(package.json の name と同じに)
const VERSION = 1;

export interface SaveData {
  v: number;
  best: number;
  lang: 'ja' | 'en';
  muted: boolean;
  played: number;
}

const DEFAULTS: SaveData = { v: VERSION, best: 0, lang: 'ja', muted: false, played: 0 };

function key() { return `${NS}:save`; }

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<SaveData>;
    // 版が古い時の移行はここに書く
    return { ...DEFAULTS, ...data, v: VERSION };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(patch: Partial<SaveData>): SaveData {
  const next = { ...load(), ...patch, v: VERSION };
  try { localStorage.setItem(key(), JSON.stringify(next)); } catch { /* private mode 等 */ }
  return next;
}

export function reset() {
  try { localStorage.removeItem(key()); } catch { /* ignore */ }
}
