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
  how1: { ja: 'おばけは灯りに寄ってくる。墓場から、一番近い家の灯りへ', en: 'Ghosts are drawn to light. They come from the graves to the nearest lit house.' },
  how2: { ja: 'タップした所へ家から提灯が飛ぶ。灯った提灯は近くのおばけを呼び、少しして弾ける', en: 'Tap: a house throws a lantern there. Lit, it calls nearby ghosts, then bursts.' },
  how3: { ja: '提灯を押すとすぐ弾ける(飛んでいる間なら着いた所で)。提灯は軒先に下がっている分だけ', en: 'Tap a lantern to burst it now (or on landing). You only have what hangs from the eaves.' },
  how4: { ja: '家におばけが入ると中の人が騒ぎ、やがて逃げ出して灯りが消える。その前に成仏させよ', en: 'A haunted house panics, then its family flees and the light dies. Free it in time!' },
  kinds: { ja: 'ふらふら幽霊 ・ ジグザグ鬼火 ・ 跳ねる唐傘 ・ 光嫌いの影法師', en: 'Drifter · Zigzag Onibi · Hopping Umbrella · Light-shy Shadow' },
  chain: { ja: '連', en: ' chain' },
  watch: { ja: '刻', en: 'Watch' },
  houses: { ja: '灯り', en: 'Lights' },
  bestChain: { ja: '最大連鎖', en: 'Best chain' },
  purified: { ja: '成仏させた数', en: 'Ghosts freed' },
  survived: { ja: '守った夜', en: 'Night survived' },
  newBest: { ja: 'ベスト更新!', en: 'New best!' },
  copyReplay: { ja: '記録をコピー', en: 'Copy replay' },
  copied: { ja: 'コピーしました', en: 'Copied' },
  rotate: { ja: '横向きにすると大きく遊べます', en: 'Rotate to landscape for a bigger view' },
  replaying: { ja: '再生中', en: 'Replay' },
  ammo: { ja: '残り', en: 'Left' },
  waveClear: { ja: '刻を越えた', en: 'Watch survived' },
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
