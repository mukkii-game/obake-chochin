// ?auto=1 の自動プレイ。作品側は DemoDriver に「毎フレーム何をするか」を渡す。
// CI(tools/check.mjs)と宣伝動画(tools/record.mjs)が使う。
import { query } from './meta';

export type DemoStep = (t: number, dt: number) => void;

export class DemoDriver {
  private t = 0;
  constructor(private step: DemoStep) {}
  static get enabled() { return query.auto; }
  update(dt: number) {
    if (!query.auto) return;
    this.t += dt;
    this.step(this.t, dt);
  }
}

/** 外部(Playwright)がスコア等を読めるように window に公開する */
export function expose(name: string, value: unknown) {
  (window as any).__game = (window as any).__game || {};
  (window as any).__game[name] = value;
}
