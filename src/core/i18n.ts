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
  ctrlPhone2: { ja: '家をタップ → なげる家を固定(もう一度タップ / 右クリックで解除)', en: 'Tap a house to lock it as the thrower (tap again / right-click to release)' },
  ctrlPC: { ja: 'PC: クリックでなげる・右クリックで固定を解除・M で音', en: 'PC: click to throw, right-click to release the lock, M for sound' },
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
  survived: { ja: 'たどりついた所', en: 'Reached' },
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
  // おばけのセリフ(| で区切って、順番に使う)
  wave: { ja: 'ウェーブ', en: 'Wave' },
  paused: { ja: 'ポーズ', en: 'PAUSED' },
  resume: { ja: 'もどる', en: 'Resume' },
  restartDay: { ja: ' のはじめから', en: ' — restart the day' },
  pauseHelp: { ja: 'ESC でもどる / ↑↓ と Enter でえらぶ', en: 'ESC to resume / arrows + Enter to choose' },
  stageSelect: { ja: 'めんセレクト', en: 'STAGE' },
  continue: { ja: 'コンティニュー', en: 'CONTINUE' },
  continueFrom: { ja: ' のはじめから(スコアは 0 から)', en: ' from the start (score resets)' },
  continueCount: { ja: 'コンティニュー', en: 'Continues' },
  daySurvived: { ja: 'しのいだ!', en: 'survived!' },
  ending1: { ja: '8月15日の夜が、明けた。', en: 'The night of August 15th is over.' },
  ending2: { ja: 'おばけたちは たのしそうに\nあの世へ かえっていった。', en: 'The ghosts went home to the other side,\nhappy as can be.' },
  ending3: { ja: 'また らいねんね!', en: 'See you next summer!' },
  staffRoll: { ja: 'スタッフ', en: 'STAFF' },
  thanks: { ja: 'あそんでくれて ありがとう!', en: 'Thank you for playing!' },
  rush: { ja: 'まってー! いそげー!', en: 'Wait for me!' },
  talk_fuwa: { ja: 'うらめしや〜|ひゅ〜どろ〜|あそぼ〜', en: 'Boo~|Wooo~|Play with me~' },
  talk_kasa: { ja: 'からんころん♪|かさかさ〜|ぴょ〜ん', en: 'Clip-clop♪|Swish~|Boing~' },
  talk_oni: { ja: 'めらめら〜|くるくる〜|ぼっ!', en: 'Flicker~|Round we go~|Poof!' },
  talk_big: { ja: 'どすこい!|でっかいぞ〜', en: 'Hup!|I\'m BIG~' },
  talk_giant: { ja: 'ずしーん…|おおきいぞ〜!', en: 'Stomp…|HUGE~!' },
  cry_yarareta: { ja: 'やられたー!', en: 'Got me!' },
  cry_hya: { ja: 'ひゃー!', en: 'Eek!' },
  cry_uwaan: { ja: 'うわーん!', en: 'Waaah!' },
  cry_kyuu: { ja: 'きゅうー…', en: 'Kyuu…' },
  cry_maitta: { ja: 'まいったー!', en: 'I give up!' },
  cry_kind_fuwa: { ja: 'やられた〜', en: 'Oof~' },
  cry_kind_kasa: { ja: 'かさ〜ん!', en: 'Flop!' },
  cry_kind_oni: { ja: 'きえる〜', en: 'Fizzle~' },
  cry_kind_big: { ja: 'まいった!', en: 'Okay okay!' },
  cry_kind_giant: { ja: 'おぼえてろ〜!', en: 'I\'ll be back~!' },
  hiScore: { ja: 'ハイスコア', en: 'HI' },
  formation: { ja: '編隊全滅', en: 'Formation wiped' },
  chainBonus: { ja: 'コンボボーナス', en: 'Combo bonus' },
  combo: { ja: 'コンボ', en: 'COMBO' },
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
