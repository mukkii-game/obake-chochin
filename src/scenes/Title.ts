import Phaser from 'phaser';
import { t, toggleLang } from '../core/i18n';
import { isMuted, toggleMuted } from '../core/audio';
import { load } from '../core/save';
import { DemoDriver, expose } from '../core/demo';
import { onTap } from '../ui/taps';
import { snd, preloadSfx } from '../game/sound';
import { txt, pop, dayName } from '../game/view';
import { WAVES_PER_DAY } from '../game/waves';
import { PAPER } from '../game/art';
import { W, H, PIECE_SETS } from '../game/logic';
import { readParams } from '../game/params';


export class Title extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    expose('scene', 'Title');
    this.cameras.main.fadeIn(400, 5, 3, 10);
    this.add.image(0, 0, 'bg').setOrigin(0);
    // タイトルは夕暮れ(遊び始めと同じ空)
    this.add.image(0, 0, 'dusk').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
    this.add.image(0, 0, 'dusk').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);

    // 飾り: 漂うおばけと提灯
    const deco: Array<[string, number, number]> = [['g_fuwa', 140, 430], ['g_oni', 215, 470], ['g_kasa', 760, 460], ['g_oni', 830, 410], ['g_fuwa', 690, 480]];
    deco.forEach(([k, x, y], i) => {
      const s = this.add.image(x, y, k).setAlpha(0.85);
      this.tweens.add({ targets: s, y: y - 10, x: x + (i % 2 ? 12 : -12), yoyo: true, repeat: -1, duration: 1400 + i * 230, ease: 'Sine.InOut' });
    });
    // ロゴ: ポップで大きく、1 文字ずつぴょこぴょこ弾む
    const lg = this.add.image(W / 2, 128, 'glow').setTint(0xff9a40).setBlendMode(Phaser.BlendModes.ADD).setScale(3.2).setAlpha(0.45);
    this.tweens.add({ targets: lg, alpha: 0.3, yoyo: true, repeat: -1, duration: 900 });
    const title = t('title');
    const size = [...title].length > 6 ? 62 : 84;
    // 影(少し下にずらした濃い色の文字)と、本体。ぴょこぴょこ弾む
    const shadow = this.add.text(W / 2, 126, title, pop(size, '#1a0818', { stroke: '#1a0818', strokeThickness: 14 })).setOrigin(0.5);
    const logo = this.add.text(W / 2, 120, title, pop(size, '#ffb347', { stroke: '#3a1838', strokeThickness: 12 })).setOrigin(0.5);
    // 文字ごとに色を変える(縦のグラデーションの代わりに、横に虹色)
    const grad = logo.context.createLinearGradient(0, 0, logo.width, 0);
    ['#ffb347', '#ff7eb6', '#ffe066', '#8fe3c8', '#c8a0ff', '#ff7eb6'].forEach((c, i, arr) => grad.addColorStop(i / (arr.length - 1), c));
    logo.setFill(grad);
    this.tweens.add({ targets: [logo, shadow], y: '-=10', scaleX: 1.03, scaleY: 0.97, yoyo: true, repeat: -1, duration: 560, ease: 'Sine.InOut' });
    const total = logo.width;
    this.add.image(W / 2 - total / 2 - 26, 92, 'lantern').setScale(0.9).setAngle(-12);

    // ひとこと(アーケードの軽さ)と、操作だけをはっきり
    this.add.text(W / 2, 190, t('catch'), pop(22, '#fff6d8')).setOrigin(0.5);
    this.add.text(W / 2, 228, `${t('rule1')}   ${t('rule2')}`, txt(16, '#ffe9c0')).setOrigin(0.5);
    const box = this.add.rectangle(W / 2, 294, 560, 76, 0x2a1430, 0.55).setStrokeStyle(2, 0xffd890, 0.4);
    void box;
    this.add.text(W / 2 - 260, 272, t('ctrlPhone'), txt(15, '#ffffff')).setOrigin(0, 0.5);
    this.add.text(W / 2 - 260, 294, t('ctrlPhone2'), txt(15, '#ffe9c0')).setOrigin(0, 0.5);
    this.add.text(W / 2 - 260, 316, t('ctrlPC'), txt(15, '#ffffff')).setOrigin(0, 0.5);
    // 家の形 = 光の形(絵で見せる)。小さなマス目に光る形を描く
    const pieces = PIECE_SETS[readParams().pieceSet] ?? PIECE_SETS['縦・横'];
    pieces.forEach((p, i) => {
      const x = W / 2 + (i - (pieces.length - 1) / 2) * 130, y = 386;
      this.add.image(x - 26, y + 22, `house_${p}_lit`).setOrigin(0.5, 0.92).setScale(0.62);
      const g = this.add.graphics();
      const cs = 9, cx = x + 26, cy = y;
      const on: Array<[number, number]> = [[0, 0]];
      if (p === 'up' || p === 'vline') for (let k = 1; k <= 2; k++) on.push([0, -k]);
      if (p === 'down' || p === 'vline') for (let k = 1; k <= 2; k++) on.push([0, k]);
      if (p === 'hline') for (let k = 1; k <= 2; k++) on.push([k, 0], [-k, 0]);
      if (p === 'cross') for (const [a, b] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [2, 0], [-2, 0]]) on.push([a, b]);
      if (p === 'area') for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) on.push([a, b]);
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
        const lit = on.some(([u, v]) => u === a && v === b);
        g.fillStyle(lit ? 0xffe0a0 : 0xffffff, lit ? (a || b ? 0.75 : 1) : 0.06);
        g.fillRect(cx + a * cs - cs / 2 + 1, cy + b * cs - cs / 2 + 1, cs - 2, cs - 2);
      }
    });

    this.add.text(PAPER.x0 + 14, H - 30, t('musicCredit'), txt(11, '#8a84a0')).setOrigin(0, 0.5);
    const start = this.add.text(W / 2, 446, t('tapToStart'), pop(26, '#ffe066')).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });
    const best = load().best;
    if (best > 0) this.add.text(PAPER.x0 + 14, 36, `${t('best')} ${best}`, txt(14, '#cccccc')).setOrigin(0, 0);
    // めんセレクト: 8/13・8/14・8/15 のどの日からでも始められる(キー 1・2・3 でも)
    this.add.text(W / 2 - 210, 484, t('stageSelect'), txt(14, '#ffe9c0')).setOrigin(1, 0.5);
    const days = [0, 1, 2].map((d) => {
      const o = this.add.text(W / 2 - 130 + d * 150, 484, dayName(d), pop(15, '#fff6d8', { backgroundColor: 'rgba(60,24,64,0.75)', strokeThickness: 3 })).setOrigin(0.5);
      return o;
    });

    // 右上: 言語 / 音
    const langBtn = this.add.text(PAPER.x1 - 14, 36, t('lang'), txt(16, '#9cf')).setOrigin(1, 0);
    const muteBtn = this.add.text(PAPER.x1 - 14, 62, isMuted() ? t('unmute') : t('mute'), txt(16, '#9cf')).setOrigin(1, 0);
    const hit = (o: Phaser.GameObjects.Text, x: number, y: number) => o.getBounds().contains(x, y) || Phaser.Geom.Rectangle.Contains(Phaser.Geom.Rectangle.Inflate(o.getBounds(), 10, 6), x, y);

    let gone = false;
    preloadSfx();
    const go = (day = 0) => { if (gone) return; gone = true; snd.ui(); this.scene.start('Play', day ? { continueWave: day * WAVES_PER_DAY } : undefined); };
    const off = onTap((x, y) => {
      if (hit(langBtn, x, y)) { snd.ui(); toggleLang(); this.scene.restart(); return; }
      if (hit(muteBtn, x, y)) { toggleMuted(); muteBtn.setText(isMuted() ? t('unmute') : t('mute')); snd.ui(); return; }
      const d = days.findIndex((o) => hit(o, x, y));
      go(Math.max(0, d));
    });
    this.events.once('shutdown', off);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (e.key === 'F2') return; go(['1', '2', '3'].includes(e.key) ? Number(e.key) - 1 : 0); });
    if (DemoDriver.enabled) this.time.delayedCall(800, go);
  }
}
