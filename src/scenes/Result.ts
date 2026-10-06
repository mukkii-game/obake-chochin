import Phaser from 'phaser';
import { t } from '../core/i18n';
import { sfx } from '../core/audio';
import { DemoDriver, expose } from '../core/demo';

export class Result extends Phaser.Scene {
  constructor() { super('Result'); }
  create(data: { score: number; best: number }) {
    expose('scene', 'Result');
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#2d1b3a');
    this.add.text(width / 2, height * 0.3, t('result'), { fontSize: '36px', color: '#fff', fontFamily: 'sans-serif' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.45, `${t('score')}: ${data.score}`, { fontSize: '28px', color: '#ffe066', fontFamily: 'sans-serif' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.53, `${t('best')}: ${data.best}`, { fontSize: '20px', color: '#ccc', fontFamily: 'sans-serif' }).setOrigin(0.5);
    const retry = this.add.text(width / 2, height * 0.7, t('retry'), { fontSize: '24px', color: '#9ad', fontFamily: 'sans-serif' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const title = this.add.text(width / 2, height * 0.78, t('toTitle'), { fontSize: '18px', color: '#9ad', fontFamily: 'sans-serif' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerdown', () => { sfx.tap(); this.scene.start('Play'); });
    title.on('pointerdown', () => { sfx.tap(); this.scene.start('Title'); });
    this.input.keyboard?.once('keydown', () => { sfx.tap(); this.scene.start('Play'); });
    if (DemoDriver.enabled) this.time.delayedCall(1500, () => this.scene.start('Play'));
  }
}
