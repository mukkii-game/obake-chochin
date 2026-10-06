// 共通の見た目の部品(文字の書式、夜の刻の名前)
import { lang } from '../core/i18n';

export const FONT = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","MS PMincho",serif';

export function txt(size: number, color = '#f3e6c8', extra: Record<string, unknown> = {}) {
  return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#0b0810', strokeThickness: Math.max(2, size / 8), ...extra };
}

const WATCH_JA = ['戌の刻', '亥の刻', '子の刻', '丑の刻', '寅の刻', '夜明け前'];
const WATCH_EN = ['Hour of the Dog', 'Hour of the Boar', 'Hour of the Rat', 'Hour of the Ox', 'Hour of the Tiger', 'Before dawn'];
export function watchName(n: number) {
  const a = lang() === 'ja' ? WATCH_JA : WATCH_EN;
  return a[Math.min(n, a.length - 1)];
}
