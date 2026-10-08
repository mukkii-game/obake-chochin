// 共通の見た目の部品(文字の書式、夜の刻の名前)
import { lang } from '../core/i18n';
import { dayOf, waveInDay, WAVES_PER_DAY } from './waves';

/** 文字: 丸くてかわいいゴシック(アーケードの軽さ)。大きな見出しはポップな太字 */
export const FONT = '"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Arial Rounded MT Bold",sans-serif';
export const POP = '"Mochiy Pop One","M PLUS Rounded 1c","Hiragino Maru Gothic ProN",sans-serif';

export function txt(size: number, color = '#f3e6c8', extra: Record<string, unknown> = {}) {
  return { fontFamily: FONT, fontStyle: '800', fontSize: `${size}px`, color, stroke: '#2a1430', strokeThickness: Math.max(3, size / 7), padding: { x: 2, y: Math.ceil(size / 6) }, ...extra };
}
/** ポップな見出し(タイトル・連鎖・ボーナス) */
export function pop(size: number, color = '#ffe27a', extra: Record<string, unknown> = {}) {
  return { fontFamily: POP, fontSize: `${size}px`, color, stroke: '#2a1430', strokeThickness: Math.max(4, size / 6), padding: { x: Math.ceil(size / 5), y: Math.ceil(size / 4) }, ...extra };
}

const HOURS_JA = ['戌', '亥', '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉'];
const HOURS_EN = ['Dog', 'Boar', 'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster'];
/** 刻の名前。戌の刻から始まり、12 刻で一巡したら「二夜目」… と数える */
export function watchName(n: number) {
  const night = Math.floor(n / 12) + 1, h = n % 12;
  if (lang() === 'ja') return (night > 1 ? `${night}夜目 ` : '') + `${HOURS_JA[h]}の刻`;
  return (night > 1 ? `Night ${night}, ` : '') + `Hour of the ${HOURS_EN[h]}`;
}

/** 日の名前: 8/13(迎え盆)・8/14・8/15(お盆)。それより先は 8/16… */
export function dayName(day: number) {
  const d = 13 + day;
  const tag = ['迎え盆', '中日', 'お盆'][day];
  if (lang() === 'ja') return `8月${d}日` + (tag ? ` ${tag}` : '');
  return `Aug ${d}` + (['  Welcome Night', '  Midsummer', '  Obon'][day] ?? '');
}
/** HUD・結果の「どこまで来たか」: 8月13日 2/3 */
export function waveLabel(n: number) {
  return `${dayName(dayOf(n))}  ${waveInDay(n) + 1}/${WAVES_PER_DAY}`;
}
