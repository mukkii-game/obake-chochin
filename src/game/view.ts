// 共通の見た目の部品(文字の書式、夜の刻の名前)
import { lang } from '../core/i18n';

export const FONT = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","MS PMincho",serif';

export function txt(size: number, color = '#f3e6c8', extra: Record<string, unknown> = {}) {
  return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#0b0810', strokeThickness: Math.max(2, size / 8), ...extra };
}

const HOURS_JA = ['戌', '亥', '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉'];
const HOURS_EN = ['Dog', 'Boar', 'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster'];
/** 刻の名前。戌の刻から始まり、12 刻で一巡したら「二夜目」… と数える */
export function watchName(n: number) {
  const night = Math.floor(n / 12) + 1, h = n % 12;
  if (lang() === 'ja') return (night > 1 ? `${night}夜目 ` : '') + `${HOURS_JA[h]}の刻`;
  return (night > 1 ? `Night ${night}, ` : '') + `Hour of the ${HOURS_EN[h]}`;
}
