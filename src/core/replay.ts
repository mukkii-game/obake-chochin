// プレイの記録と再現。seed + 「何フレーム目に何を入力したか」の列だけを持つ。
// ゲームの中身(ロジック)がこの 2 つだけで決まるように作れば、
//  - 文字列にしてコピー → 貼ればバグが再現する
//  - AI の bot は描画なしで中身だけを高速に回せる(トークンが安い)
// ?replay=<文字列> で記録を再生できる。
import { query } from './meta';

export type InputFrame = [frame: number, input: string];
export interface Recording { v: 1; seed: number; inputs: InputFrame[] }

export class Recorder {
  readonly rec: Recording;
  constructor(seed: number) { this.rec = { v: 1, seed, inputs: [] }; }
  /** 入力があったフレームだけ記録する(無入力のフレームは持たない) */
  push(frame: number, input: string) { if (input) this.rec.inputs.push([frame, input]); }
  toString() { return encodeRecording(this.rec); }
  /** クリップボードへ。失敗しても無視(iframe 内などで拒否されることがある) */
  async copy() { try { await navigator.clipboard.writeText(this.toString()); } catch { /* 無視 */ } }
}

/** 記録を再生する。frame ごとに input(frame) を呼ぶと、その時の入力を返す */
export class Player {
  private i = 0;
  constructor(readonly rec: Recording) {}
  input(frame: number): string {
    let out = '';
    while (this.i < this.rec.inputs.length && this.rec.inputs[this.i][0] === frame) {
      out += this.rec.inputs[this.i++][1];
    }
    return out;
  }
  get done() { return this.i >= this.rec.inputs.length; }
}

export function encodeRecording(r: Recording): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(r)))).replace(/=+$/, '');
}
export function decodeRecording(s: string): Recording | null {
  try {
    const r = JSON.parse(decodeURIComponent(escape(atob(s))));
    return r && r.v === 1 && Array.isArray(r.inputs) ? r : null;
  } catch { return null; }
}

/** ?replay= で渡された記録(無ければ null) */
export function replayFromUrl(): Recording | null {
  const s = query.get('replay');
  return s ? decodeRecording(s) : null;
}
