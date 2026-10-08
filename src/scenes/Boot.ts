import Phaser from 'phaser';
import { expose } from '../core/demo';
import { META } from '../core/meta';
import { makeArt } from '../game/art';
import { allText } from '../core/i18n';

/**
 * 絵は src/game/art.ts で手続き的に描く。public/art/manifest.json に { "キー": "ファイル名" } を書くと、
 * そのキーの絵を public/art/ の画像に差し替える(大きさは手続きの絵と同じ枠に収める。ComfyUI 等で作った絵を入れる道)。
 * キーの一覧と作り方は tools/art/README.md。
 */
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    this.load.json('artManifest', 'art/manifest.json');
  }
  create() {
    expose('version', META.version);
    expose('scene', 'Boot');
    makeArt(this);
    // 文字(Web フォント)が読めるまで少し待つ(読めなくても 1.5 秒で進む)
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = fonts ? Promise.race([Promise.all(['40px "Mochiy Pop One"', '800 20px "M PLUS Rounded 1c"'].map((f) => fonts.load(f, allText()))), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
    ready.catch(() => {}).then(() => this.afterFonts());
  }

  private afterFonts() {
    const manifest = (this.cache.json.get('artManifest') ?? {}) as Record<string, string>;
    const keys = Object.keys(manifest).filter((k) => this.textures.exists(k));
    if (!keys.length) { this.scene.start('Title'); return; }
    for (const k of keys) this.load.image(`mine:${k}`, `art/${manifest[k]}`);
    this.load.once('complete', () => {
      for (const k of keys) if (this.textures.exists(`mine:${k}`)) replaceTexture(this, k, `mine:${k}`);
      this.scene.start('Title');
    });
    this.load.start();
  }
}

/** 手続きの絵 key を、読み込んだ画像 src に差し替える(同じ大きさの枠に、縦横比を保って下揃えで収める) */
function replaceTexture(scene: Phaser.Scene, key: string, src: string) {
  const old = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const img = scene.textures.get(src).getSourceImage() as HTMLImageElement;
  const w = old.width, h = old.height;
  const k = 1; // 表示の倍率は手続きの絵と同じ(シーン側の setScale がそのまま効く)
  const cv = document.createElement('canvas');
  cv.width = w * k; cv.height = h * k;
  const c = cv.getContext('2d')!;
  const s = Math.min((w * k) / img.width, (h * k) / img.height);
  const dw = img.width * s, dh = img.height * s;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, (w * k - dw) / 2, h * k - dh, dw, dh);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
  scene.textures.remove(src);
}
