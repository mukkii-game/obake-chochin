import Phaser from 'phaser';
import { t } from '../core/i18n';
import { DemoDriver, expose } from '../core/demo';
import { onTap } from '../ui/taps';
import { snd } from '../game/sound';
import { txt, watchName } from '../game/view';
import { W } from '../game/logic';

interface ResultData {
  score: number; best: number; newBest: boolean; bestChain: number; purified: number; watch: number; seconds: number; replay: string; cleared?: boolean; formations?: number;
}

export class Result extends Phaser.Scene {
  constructor() { super('Result'); }
  create(d: ResultData) {
    expose('scene', 'Result');
    this.cameras.main.fadeIn(500, 5, 3, 10);
    this.add.image(0, 0, 'bg').setOrigin(0);
    this.add.rectangle(W / 2, 270, 560, 400, 0x07060c, 0.55);
    this.add.text(W / 2, 110, d.cleared ? t('clearTitle') : t('result'), txt(36, d.cleared ? '#ffe27a' : '#e8d6ff')).setOrigin(0.5);
    this.add.text(W / 2, 175, `${t('score')} ${d.score}`, txt(44, '#ffe27a')).setOrigin(0.5);
    if (d.newBest) {
      const nb = this.add.text(W / 2, 214, t('newBest'), txt(18, '#ffb0e0')).setOrigin(0.5);
      this.tweens.add({ targets: nb, scale: 1.15, yoyo: true, repeat: -1, duration: 500 });
    } else this.add.text(W / 2, 214, `${t('best')} ${d.best}`, txt(16, '#ccc')).setOrigin(0.5);
    const rows = [
      `${t('bestChain')}  ${d.bestChain}${t('chain')}`,
      `${t('purified')}  ${d.purified}`,
      `${t('formations')}  ${d.formations ?? 0}`,
      `${t('survived')}  ${watchName(d.watch)}(${d.seconds}s)`,
    ];
    this.add.text(W / 2, 248, rows.join('\n'), txt(18, '#f3e6c8', { align: 'center', lineSpacing: 8 })).setOrigin(0.5, 0);

    const retry = this.add.text(W / 2 - 110, 400, t('retry'), txt(26, '#9cf')).setOrigin(0.5);
    const title = this.add.text(W / 2 + 110, 400, t('toTitle'), txt(22, '#9cf')).setOrigin(0.5);
    const copy = this.add.text(W / 2, 448, t('copyReplay'), txt(14, '#889')).setOrigin(0.5);
    const near = (o: Phaser.GameObjects.Text, x: number, y: number) => Phaser.Geom.Rectangle.Contains(Phaser.Geom.Rectangle.Inflate(o.getBounds(), 20, 12), x, y);

    let ready = false;
    this.time.delayedCall(600, () => { ready = true; }); // 連打でうっかり再開しない
    const off = onTap((x, y) => {
      if (!ready) return;
      if (near(copy, x, y)) {
        try { navigator.clipboard?.writeText(location.href.split('?')[0] + '?replay=' + d.replay).catch(() => {}); } catch { /* 無視 */ }
        copy.setText(t('copied')); snd.ui(); return;
      }
      if (near(title, x, y)) { snd.ui(); this.scene.start('Title'); return; }
      if (near(retry, x, y)) { snd.ui(); this.scene.start('Play'); }
    });
    this.events.once('shutdown', off);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (ready && (e.key === 'Enter' || e.key === ' ' || e.key === 'r')) this.scene.start('Play'); });
    if (DemoDriver.enabled) this.time.delayedCall(2500, () => this.scene.start('Play'));
  }
}
