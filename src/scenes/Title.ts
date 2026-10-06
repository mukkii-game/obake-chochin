import Phaser from 'phaser';
import { t, toggleLang } from '../core/i18n';
import { isMuted, toggleMuted, sfx } from '../core/audio';
import { load } from '../core/save';
import { DemoDriver, expose } from '../core/demo';
import { addTouchHint } from '../ui/touch';

export class Title extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    expose('scene', 'Title');
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1b1f3a');

    this.add.text(width / 2, height * 0.35, t('title'), { fontSize: '40px', color: '#ffffff', fontFamily: 'sans-serif' }).setOrigin(0.5);
    const start = this.add.text(width / 2, height * 0.55, t('tapToStart'), { fontSize: '20px', color: '#ffe066', fontFamily: 'sans-serif' }).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.3, yoyo: true, repeat: -1, duration: 600 });
    this.add.text(width / 2, height * 0.65, `${t('best')}: ${load().best}`, { fontSize: '16px', color: '#cccccc', fontFamily: 'sans-serif' }).setOrigin(0.5);

    // 右上: 言語 / 音 切替
    const langBtn = this.add.text(width - 12, 12, t('lang'), { fontSize: '16px', color: '#9ad', fontFamily: 'sans-serif' }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    langBtn.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation(); sfx.ui(); toggleLang(); this.scene.restart();
    });
    const muteBtn = this.add.text(width - 12, 40, isMuted() ? t('unmute') : t('mute'), { fontSize: '16px', color: '#9ad', fontFamily: 'sans-serif' }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    muteBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation(); toggleMuted(); muteBtn.setText(isMuted() ? t('unmute') : t('mute')); sfx.ui();
    });

    addTouchHint(this, t('hint'));

    const go = () => { sfx.tap(); this.scene.start('Play'); };
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown', go);
    if (DemoDriver.enabled) this.time.delayedCall(800, go);
  }
}
