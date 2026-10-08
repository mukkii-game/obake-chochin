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
  how1: { ja: 'おばけは上から、決まった動き(まっすぐ・ジグザグ・曲線)で灯りの家へ来る', en: 'Ghosts come down toward the lit houses, each with a fixed way of moving (straight, zigzag, curve).' },
  how2: { ja: 'マスをタップ → 近くの家から提灯が飛び、着いた所で弾ける。縦の楼は縦一列、長屋は横一列に光る', en: 'Tap a square: a lantern flies from a nearby house and bursts where it lands. Tall house = column, long house = row.' },
  how3: { ja: '飛んでいる提灯をもう一度押すと、弾けずに下がって待つ。たどり着いたおばけは止まり、後ろが詰まる', en: 'Tap a flying lantern again and it hangs instead. Ghosts that reach it stop, and the ones behind pile up.' },
  how4: { ja: '光が届いた提灯も弾ける。家をタップすると、その家の提灯をどこへでも投げられる', en: 'Light sets off other lanterns. Tap a house first to throw from that house.' },
  kinds: { ja: 'まっすぐの幽霊 ・ ジグザグの唐傘 ・ 曲がって来る鬼火', en: 'Ghost: straight · Umbrella: zigzag · Onibi: curve' },
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
