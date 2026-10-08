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
  how1: { ja: 'おばけはあの世の口から、決まった動きで灯りの家へ来る(迷路を歩く・壁を越えて飛ぶ)', en: 'Ghosts come from the graves toward lit houses, each with a fixed way of moving (walking the maze, or flying over walls).' },
  how2: { ja: 'マスをタップ → 近くの家から提灯が飛ぶ。先に家をタップすれば、その家の提灯をどこへでも', en: 'Tap a square: the nearest house throws a lantern. Tap a house first to throw that house\'s lantern anywhere.' },
  how3: { ja: '下がった提灯は罠。押すと家の形どおりに光る(櫓 = 上、提灯屋 = 下、蔵 = 周り)。届いた提灯も弾ける', en: 'Hung lanterns are traps. Tap one: light takes its house\'s shape (tower = up, shop = down, storehouse = around).' },
  how4: { ja: '光は柱と板塀で止まる。おばけを縦に並べて遠くまでつなげ。提灯は軒先にある分だけ', en: 'Light stops at blocks and fences. Line ghosts up and chain far. You only have the lanterns on the eaves.' },
  kinds: { ja: '最短の道を歩く幽霊 ・ 一直線に飛ぶ鬼火 ・ ジグザグの唐傘 ・ 灯りを避けて歩く影法師', en: 'Ghost: shortest path · Onibi: straight line · Umbrella: zigzag · Shadow: walks around light' },
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
  selectTitle: { ja: '面を選ぶ', en: 'Choose a Stage' },
  example: { ja: '手本', en: 'Example' },
  watchingExample: { ja: '手本(この面の正解の一つ)', en: 'Example (one solution)' },
  free: { ja: '気まぐれ', en: 'Endless' },
  freeIdea: { ja: '毎回ちがう迷路と家並み。どこまで守れるか', en: 'A new maze every time. How long can you last?' },
  goal: { ja: '目標', en: 'Goal' },
  cleared: { ja: '守り切った', en: 'Stage cleared' },
  failed: { ja: '灯りが消えた', en: 'The lights went out' },
  starClear: { ja: '守り切る', en: 'Clear' },
  starKeep: { ja: '家を一軒も消さない', en: 'Lose no house' },
  starChain: { ja: '連鎖', en: 'chain' },
  next: { ja: '次の面', en: 'Next' },
  toSelect: { ja: '面を選ぶ', en: 'Stages' },
  stageNo: { ja: '第', en: 'Stage ' },
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
