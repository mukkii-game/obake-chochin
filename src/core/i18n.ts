// key → {ja, en}。?lang= が最優先、次にセーブ、次にブラウザ言語。
import { load, save } from './save';
import { query } from './meta';

export type Lang = 'ja' | 'en';

const TABLE: Record<string, { ja: string; en: string }> = {
  title: { ja: 'おばけ提灯', en: 'Obake Chochin' },
  subtitle: { ja: '〜 夜の村の灯り守り 〜', en: '~ Lantern Keeper of the Night Village ~' },
  tapToStart: { ja: 'タップ / クリックではじめる', en: 'Tap or click to start' },
  score: { ja: 'スコア', en: 'Score' },
  best: { ja: 'ベスト', en: 'Best' },
  result: { ja: '村の灯りが消えた', en: 'The village went dark' },
  retry: { ja: 'もういちど', en: 'Retry' },
  toTitle: { ja: 'タイトルへ', en: 'Title' },
  lang: { ja: 'EN', en: '日本語' },
  mute: { ja: '音: ON', en: 'Sound: ON' },
  unmute: { ja: '音: OFF', en: 'Sound: OFF' },
  how1: { ja: 'タップで提灯を置く(3つまで)。おばけは灯りに寄ってくる', en: 'Tap to place a lantern (max 3). Ghosts drift toward its light.' },
  how2: { ja: 'もう一度タップで提灯を割る。溜めて割ると連鎖で成仏', en: 'Tap it again to break it. Gather many, then break for a chain!' },
  how3: { ja: '成仏したおばけは味方の灯りに。大連鎖で家の灯りが戻る', en: 'Freed ghosts become friendly lights. Big chains relight houses.' },
  how4: { ja: 'おばけが家に入ると灯りが消える。全部消えたら終わり', en: 'A ghost entering a house puts its light out. All dark = game over.' },
  kinds: { ja: 'ふらふら幽霊 ・ ジグザグ鬼火 ・ 跳ねる唐傘 ・ 光嫌いの影法師', en: 'Drifter · Zigzag Onibi · Hopping Umbrella · Light-shy Shadow' },
  chain: { ja: '連', en: ' chain' },
  watch: { ja: '刻', en: 'Watch' },
  houses: { ja: '灯り', en: 'Lights' },
  bestChain: { ja: '最大連鎖', en: 'Best chain' },
  purified: { ja: '成仏させた数', en: 'Ghosts freed' },
  survived: { ja: '守った夜', en: 'Night survived' },
  newBest: { ja: 'ベスト更新!', en: 'New best!' },
  relit: { ja: '灯りが戻った!', en: 'Light restored!' },
  copyReplay: { ja: '記録をコピー', en: 'Copy replay' },
  copied: { ja: 'コピーしました', en: 'Copied' },
  rotate: { ja: '横向きにすると大きく遊べます', en: 'Rotate to landscape for a bigger view' },
  kiraiTip: { ja: '影法師は提灯の光を嫌う。味方の灯りには寄ってくる', en: 'Shadows avoid lanterns, but are drawn to friendly lights.' },
  hopTip: { ja: '唐傘は溜めてから急に跳ぶ', en: 'Umbrellas crouch, then suddenly leap.' },
  zigTip: { ja: '鬼火はジグザグに迫る', en: 'Onibi zigzag toward houses.' },
  replaying: { ja: '再生中', en: 'Replay' },
  demo: { ja: 'デモ', en: 'Demo' },
};

let current: Lang = detect();

function detect(): Lang {
  const q = query.lang;
  if (q === 'ja' || q === 'en') return q;
  const s = load().lang;
  if (s) return s;
  return navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export function lang(): Lang { return current; }

export function setLang(l: Lang) {
  current = l;
  save({ lang: l });
}

export function toggleLang(): Lang {
  setLang(current === 'ja' ? 'en' : 'ja');
  return current;
}

/** t('score') → 現在言語の文字列。未登録キーはそのまま返す */
export function t(key: string): string {
  const e = TABLE[key];
  return e ? e[current] : key;
}

/** 作品側で文字列を足す */
export function addStrings(extra: Record<string, { ja: string; en: string }>) {
  Object.assign(TABLE, extra);
}
