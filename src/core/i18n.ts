// key → {ja, en}。?lang= が最優先、次にセーブ、次にブラウザ言語。
import { load, save } from './save';
import { query } from './meta';

export type Lang = 'ja' | 'en';

const TABLE: Record<string, { ja: string; en: string }> = {
  title: { ja: 'おばけ提灯', en: 'Obake Chochin' },
  catch: { ja: 'ちょうちん投げて、おばけをまとめて成仏!', en: 'Toss lanterns. Blast ghosts. Chain it up!' },
  rule1: { ja: '3びょうでドカン! となりもドカン!', en: 'Boom in 3 s, and the next one goes too!' },
  rule2: { ja: '家のかたち = 光のかたち(たて・よこ・まる)', en: 'House shape = light shape' },
  ctrlPhone: { ja: 'スマホ: なげたい所をタップ(はなした所へ飛ぶ)', en: 'Phone: tap where to throw (it flies where you let go)' },
  ctrlPhone2: { ja: '　　　家から指をすべらせると、その家の提灯をなげる', en: '        Slide from a house to throw its lantern' },
  ctrlPC: { ja: 'PC: クリックでなげる・マウスで光る所が見える・M で音', en: 'PC: click to throw, hover to preview, M for sound' },
  subtitle: { ja: '〜 夜の村の灯り守り 〜', en: '~ Lantern Keeper of the Night Village ~' },
  tapToStart: { ja: 'タップでスタート!', en: 'Tap to start!' },
  score: { ja: 'スコア', en: 'Score' },
  best: { ja: 'ベスト', en: 'Best' },
  result: { ja: '村の灯りが消えた', en: 'The village went dark' },
  retry: { ja: 'もういちど', en: 'Retry' },
  toTitle: { ja: 'タイトルへ', en: 'Title' },
  lang: { ja: 'EN', en: '日本語' },
  mute: { ja: '音: ON', en: 'Sound: ON' },
  unmute: { ja: '音: OFF', en: 'Sound: OFF' },
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
  screams: { ja: 'キャー!|ワー!|ひぃ〜!|わぁっ!', en: 'Eek!|Aaah!|Help!|Waah!' },
  obakeComing: { ja: 'おばけが、くるぞー!', en: 'Here come the ghosts!' },
  hiScore: { ja: 'ハイスコア', en: 'HI' },
  formation: { ja: '編隊全滅', en: 'Formation wiped' },
  chainBonus: { ja: '連鎖ボーナス', en: 'Chain bonus' },
  clearTitle: { ja: '夜を守り切った', en: 'You kept the lights on' },
  formations: { ja: '編隊全滅', en: 'Formations wiped' },
  musicCredit: { ja: '音楽：魔王魂 / 声：HTS Voice Mei(名古屋工業大学, CC BY 3.0)', en: 'Music: MaouDamashii / Voice: HTS Voice Mei (Nagoya Inst. of Tech., CC BY 3.0)' },
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

/** 使う文字のすべて(Web フォントを先に読んでおくため) */
export function allText(): string { return Object.values(TABLE).map((v) => v.ja + v.en).join('') + '0123456789+!連刻'; }
