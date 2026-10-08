import Phaser from 'phaser';
import { t, toggleLang } from '../core/i18n';
import { isMuted, toggleMuted } from '../core/audio';
import { load } from '../core/save';
import { DemoDriver, expose } from '../core/demo';
import { onTap } from '../ui/taps';
import { snd } from '../game/sound';
import { txt } from '../game/view';
import { PAPER } from '../game/art';
import { W, H, PIECE_SETS } from '../game/logic';
import { readParams } from '../game/params';


export class Title extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    expose('scene', 'Title');
    this.cameras.main.fadeIn(400, 5, 3, 10);
    this.add.image(0, 0, 'bg').setOrigin(0);
    this.add.image(PAPER.x1 - 120, 92, 'moon');
    this.add.rectangle(W / 2, 300, 700, 160, 0x07060c, 0.45);

    // 飾り: 漂うおばけと提灯
    const deco: Array<[string, number, number]> = [['g_fuwa', 140, 430], ['g_oni', 215, 470], ['g_kasa', 760, 460], ['g_kirai', 830, 410], ['g_fuwa', 690, 480]];
    deco.forEach(([k, x, y], i) => {
      const s = this.add.image(x, y, k).setAlpha(0.85);
      this.tweens.add({ targets: s, y: y - 10, x: x + (i % 2 ? 12 : -12), yoyo: true, repeat: -1, duration: 1400 + i * 230, ease: 'Sine.InOut' });
    });
    const lg = this.add.image(W / 2, 112, 'glow').setTint(0xff9a40).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4).setAlpha(0.5);
    this.tweens.add({ targets: lg, alpha: 0.35, yoyo: true, repeat: -1, duration: 900 });
    this.add.image(W / 2, 112, 'lantern').setScale(1.5);

    this.add.text(W / 2, 178, t('title'), txt(58, '#fff1d0', { strokeThickness: 8 })).setOrigin(0.5);
    this.add.text(W / 2, 222, t('subtitle'), txt(17, '#e8d6ff')).setOrigin(0.5);
    const lines = ['how1', 'how2', 'how3', 'how4'].map((k) => t(k));
    this.add.text(W / 2, 252, lines.join('\n'), txt(16, '#f3e6c8', { align: 'center', lineSpacing: 6 })).setOrigin(0.5, 0);
    this.add.text(W / 2, 372, t('kinds'), txt(13, '#b9b0d0')).setOrigin(0.5);
    // 家の形 = 光の形(絵で見せる)。小さなマス目に光る形を描く
    const pieces = PIECE_SETS[readParams().pieceSet] ?? PIECE_SETS['上・下・周り'];
    pieces.forEach((p, i) => {
      const x = W / 2 + (i - (pieces.length - 1) / 2) * 130, y = 420;
      this.add.image(x - 26, y + 22, `house_${p}_lit`).setOrigin(0.5, 0.92).setScale(0.62);
      const g = this.add.graphics();
      const cs = 9, cx = x + 26, cy = y;
      const on: Array<[number, number]> = [[0, 0]];
      if (p === 'up' || p === 'vline') for (let k = 1; k <= 3; k++) on.push([0, -k]);
      if (p === 'down' || p === 'vline') for (let k = 1; k <= 3; k++) on.push([0, k]);
      if (p === 'hline') for (let k = 1; k <= 3; k++) on.push([k, 0], [-k, 0]);
      if (p === 'cross') for (const [a, b] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [2, 0], [-2, 0]]) on.push([a, b]);
      if (p === 'area') for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) on.push([a, b]);
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
        const lit = on.some(([u, v]) => u === a && v === b);
        g.fillStyle(lit ? 0xffe0a0 : 0xffffff, lit ? (a || b ? 0.75 : 1) : 0.06);
        g.fillRect(cx + a * cs - cs / 2 + 1, cy + b * cs - cs / 2 + 1, cs - 2, cs - 2);
      }
    });

    const start = this.add.text(W / 2, 470, t('tapToStart'), txt(22, '#ffe066')).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });
    const best = load().best;
    if (best > 0) this.add.text(W / 2, 500, `${t('best')} ${best}`, txt(14, '#cccccc')).setOrigin(0.5);

    // 右上: 言語 / 音
    const langBtn = this.add.text(PAPER.x1 - 14, 36, t('lang'), txt(16, '#9cf')).setOrigin(1, 0);
    const muteBtn = this.add.text(PAPER.x1 - 14, 62, isMuted() ? t('unmute') : t('mute'), txt(16, '#9cf')).setOrigin(1, 0);
    const hit = (o: Phaser.GameObjects.Text, x: number, y: number) => o.getBounds().contains(x, y) || Phaser.Geom.Rectangle.Contains(Phaser.Geom.Rectangle.Inflate(o.getBounds(), 10, 6), x, y);

    let gone = false;
    const go = () => { if (gone) return; gone = true; snd.ui(); if (DemoDriver.enabled) this.scene.start('Play'); else this.scene.start('Select'); };
    const off = onTap((x, y) => {
      if (hit(langBtn, x, y)) { snd.ui(); toggleLang(); this.scene.restart(); return; }
      if (hit(muteBtn, x, y)) { toggleMuted(); muteBtn.setText(isMuted() ? t('unmute') : t('mute')); snd.ui(); return; }
      go();
    });
    this.events.once('shutdown', off);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (e.key !== 'F2') go(); });
    if (DemoDriver.enabled) this.time.delayedCall(800, go);
    // ?stage=3(&example=1)で、その面(の手本)へ直接
    const qs = new URLSearchParams(location.search);
    const sn = Number(qs.get('stage'));
    if (!DemoDriver.enabled && sn >= 1 && !qs.get('replay')) { gone = true; this.time.delayedCall(50, () => this.scene.start('Play', { stage: sn - 1, example: qs.get('example') === '1' })); }
    void H;
  }
}
