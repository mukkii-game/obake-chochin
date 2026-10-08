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
  how1: { ja: 'おばけは上から、決まった動き(階段・ジグザグ・輪)で灯りの家へ来る', en: 'Ghosts come down toward the lit houses in fixed ways (steps, zigzag, loops).' },
  how2: { ja: '押した所へ近くの家から提灯が飛ぶ。家と提灯の形 = 光の形(縦長 = 縦、横長 = 横、丸 = 丸)', en: 'Tap anywhere: a lantern flies from a nearby house. Its shape is the light: tall, wide or round.' },
  how3: { ja: '置かれた提灯は 3 秒で弾け、光が届いた提灯もすぐ弾ける。着いたおばけは止まり、後ろが詰まる', en: 'Lanterns burst 3 s after landing and set each other off. Ghosts stop at a lantern and pile up.' },
  how4: { ja: '家をタップしてから投げると、その家の提灯を投げられる。編隊を一度に全部倒すと大きな得点。全 10 刻', en: 'Tap a house first to throw its lantern. Wipe out a whole formation at once for big points. 10 watches.' },
  kinds: { ja: '階段の幽霊(縦・横)・ ジグザグの唐傘 ・ 輪を描く鬼火(丸が有利)', en: 'Ghost: steps · Umbrella: zigzag · Onibi: loops (round light works best)' },
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
  hiScore: { ja: 'ハイスコア', en: 'HI' },
  formation: { ja: '編隊全滅', en: 'Formation wiped' },
  chainBonus: { ja: '連鎖ボーナス', en: 'Chain bonus' },
  clearTitle: { ja: '夜を守り切った', en: 'You kept the lights on' },
  formations: { ja: '編隊全滅', en: 'Formations wiped' },
  musicCredit: { ja: '音楽：魔王魂', en: 'Music: MaouDamashii' },
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
