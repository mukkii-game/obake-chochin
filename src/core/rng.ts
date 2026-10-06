// seed 付き乱数。同じ seed なら必ず同じ並びが出る(プレイの再現に使う)。
// ゲームの中では Math.random() を使わず、これを使うこと。
// ?seed=123 で seed を固定できる(バグの再現・CI の確認用)。
import { query } from './meta';

export class Rng {
  private s: number;
  constructor(public readonly seed: number) { this.s = seed >>> 0 || 1; }
  /** 0 以上 1 未満(mulberry32) */
  next(): number {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** min 以上 max 以下の整数 */
  int(min: number, max: number) { return min + Math.floor(this.next() * (max - min + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
}

/** URL の ?seed= があればそれ、無ければ時刻から決める */
export function startSeed(): number {
  const q = Number(query.get('seed'));
  return Number.isFinite(q) && q > 0 ? q >>> 0 : (Date.now() % 2147483647) >>> 0;
}
