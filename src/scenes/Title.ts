import Phaser from 'phaser';
import { t, toggleLang } from '../core/i18n';
import { isMuted, toggleMuted } from '../core/audio';
import { load } from '../core/save';
import { DemoDriver, expose } from '../core/demo';
import { onTap } from '../ui/taps';
import { snd } from '../game/sound';
import { txt } from '../game/view';
import { PAPER } from '../game/art';
import { W, H, HOUSE_POS } from '../game/logic';

export class Title extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    expose('scene', 'Title');
    this.cameras.main.fadeIn(400, 5, 3, 10);
    this.add.image(0, 0, 'bg').setOrigin(0);
    this.add.image(PAPER.x1 - 120, 92, 'moon');
    for (const [x, y] of HOUSE_POS) {
      this.add.image(x, y + 6, 'glow').setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setAlpha(0.35);
      this.add.image(x, y, 'house_lit').setOrigin(0.5, 0.6).setAlpha(0.55);
    }
    this.add.rectangle(W / 2, 300, 700, 160, 0x07060c, 0.45);

    // 飾り: 漂うおばけと提灯
    const deco: Array<[string, number, number]> = [['g_fuwa', 170, 380], ['g_zig', 300, 430], ['g_hop', 690, 420], ['g_kirai', 810, 380], ['g_fuwa', 560, 450]];
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

    const start = this.add.text(W / 2, 470, t('tapToStart'), txt(22, '#ffe066')).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });
    const best = load().best;
    if (best > 0) this.add.text(W / 2, 500, `${t('best')} ${best}`, txt(14, '#cccccc')).setOrigin(0.5);

    // 右上: 言語 / 音
    const langBtn = this.add.text(PAPER.x1 - 14, 36, t('lang'), txt(16, '#9cf')).setOrigin(1, 0);
    const muteBtn = this.add.text(PAPER.x1 - 14, 62, isMuted() ? t('unmute') : t('mute'), txt(16, '#9cf')).setOrigin(1, 0);
    const hit = (o: Phaser.GameObjects.Text, x: number, y: number) => o.getBounds().contains(x, y) || Phaser.Geom.Rectangle.Contains(Phaser.Geom.Rectangle.Inflate(o.getBounds(), 10, 6), x, y);

    let gone = false;
    const go = () => { if (gone) return; gone = true; snd.ui(); this.scene.start('Play'); };
    const off = onTap((x, y) => {
      if (hit(langBtn, x, y)) { snd.ui(); toggleLang(); this.scene.restart(); return; }
      if (hit(muteBtn, x, y)) { toggleMuted(); muteBtn.setText(isMuted() ? t('unmute') : t('mute')); snd.ui(); return; }
      go();
    });
    this.events.once('shutdown', off);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (e.key !== 'F2') go(); });
    if (DemoDriver.enabled) this.time.delayedCall(800, go);
    void H;
  }
}
