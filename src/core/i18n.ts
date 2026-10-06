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
  how1: { ja: 'タップした所へ、近くの家から提灯が飛ぶ(3つまで)。着くまでにおばけは進む。先を読め', en: 'Tap a spot: a lantern flies there from the nearest house (max 3). Lead your shot!' },
  how2: { ja: '灯った提灯はおばけを呼び寄せる。周りの輪が「今割ったら巻き込む範囲」。待つほど育つ', en: 'A lit lantern calls ghosts in. Its ring shows what a break would catch, and it grows.' },
  how3: { ja: 'でも最初の1体が提灯に着いたら食われて消える。その直前にタップで割れ!', en: 'But the first ghost to reach it eats it. Tap to break it just before!' },
  how4: { ja: '飛んでいる提灯の印を押すと、着いた瞬間に割れる。家が全部消えたら終わり', en: 'Tap a flying lantern’s mark to burst on arrival. All houses dark = game over.' },
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
  kiraiTip: { ja: '影法師は灯りを避ける。飛んでいる提灯の印を押して、着いた瞬間に割れ', en: 'Shadows dodge light. Tap the target mark mid-flight to burst on arrival.' },
  hopTip: { ja: '唐傘は溜めてから跳ぶ。着地点の輪を狙え', en: 'Umbrellas crouch, then leap. Aim at the landing ring.' },
  zigTip: { ja: '鬼火はジグザグに迫る', en: 'Onibi zigzag toward houses.' },
  replaying: { ja: '再生中', en: 'Replay' },
  waveClear: { ja: '刻を越えた', en: 'Watch survived' },
  lightTip: { ja: '輪の中に入ったおばけを、提灯に着く前に割って巻き込め', en: 'Break it before the first ghost reaches it — catch everyone in the ring!' },
  eaten: { ja: '食われた!', en: 'Eaten!' },
  escaped: { ja: '逃げられた…', en: 'Escaped…' },
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
