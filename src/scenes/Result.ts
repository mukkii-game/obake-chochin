import Phaser from 'phaser';
import { t } from '../core/i18n';
import { DemoDriver, expose } from '../core/demo';
import { onTap } from '../ui/taps';
import { snd } from '../game/sound';
import { txt, pop, waveLabel, dayName } from '../game/view';
import { dayOf, WAVES_PER_DAY } from '../game/waves';
import { W } from '../game/logic';

interface ResultData {
  score: number; best: number; newBest: boolean; bestChain: number; purified: number; watch: number; seconds: number; replay: string; cleared?: boolean; formations?: number; continues?: number;
}

export class Result extends Phaser.Scene {
  constructor() { super('Result'); }
  create(d: ResultData) {
    expose('scene', 'Result');
    this.cameras.main.fadeIn(500, 5, 3, 10);
    this.add.image(0, 0, 'bg').setOrigin(0);
    this.add.rectangle(W / 2, 280, 560, 440, 0x07060c, 0.55);
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
      `${t('survived')}  ${waveLabel(Math.min(d.watch, 8))}(${d.seconds}s)`,
    ];
    if (d.continues) rows.push(`${t('continueCount')}  ${d.continues}`);
    this.add.text(W / 2, 236, rows.join('\n'), txt(16, '#f3e6c8', { align: 'center', lineSpacing: 4 })).setOrigin(0.5, 0);

    // コンティニュー(負けた時だけ): やられた日の頭から。アーケードのように 9 から数えて、0 で消える
    const day = dayOf(Math.min(d.watch, 8));
    let cont: Phaser.GameObjects.Text | null = null;
    if (!d.cleared) {
      cont = this.add.text(W / 2, 380, '', pop(28, '#ffe27a')).setOrigin(0.5);
      let left = 9;
      const show = () => cont?.setText(`${t("continue")}?  ${left}`);
      show();
      const sub = this.add.text(W / 2, 410, `${dayName(day)}${t('continueFrom')}`, txt(14, '#ffe9c0')).setOrigin(0.5);
      this.tweens.add({ targets: cont, scale: 1.08, yoyo: true, repeat: -1, duration: 400 });
      this.time.addEvent({ delay: 1000, repeat: 9, callback: () => {
        left--; if (left >= 0) { show(); snd.ui(); }
        if (left < 0 && cont) { cont.destroy(); sub.destroy(); cont = null; }
      } });
    }
    const goContinue = () => { snd.ui(); this.scene.start('Play', { continueWave: day * WAVES_PER_DAY, continues: (d.continues ?? 0) + 1 }); };
    const retry = this.add.text(W / 2 - 110, 446, t('retry'), txt(24, '#9cf')).setOrigin(0.5);
    const title = this.add.text(W / 2 + 110, 446, t('toTitle'), txt(20, '#9cf')).setOrigin(0.5);
    const copy = this.add.text(W / 2, 482, t('copyReplay'), txt(14, '#889')).setOrigin(0.5);
    const near = (o: Phaser.GameObjects.Text, x: number, y: number) => Phaser.Geom.Rectangle.Contains(Phaser.Geom.Rectangle.Inflate(o.getBounds(), 20, 12), x, y);

    let ready = false;
    this.time.delayedCall(600, () => { ready = true; }); // 連打でうっかり再開しない
    const off = onTap((x, y) => {
      if (!ready) return;
      if (near(copy, x, y)) {
        try { navigator.clipboard?.writeText(location.href.split('?')[0] + '?replay=' + d.replay).catch(() => {}); } catch { /* 無視 */ }
        copy.setText(t('copied')); snd.ui(); return;
      }
      if (cont && near(cont, x, y)) { goContinue(); return; }
      if (near(title, x, y)) { snd.ui(); this.scene.start('Title'); return; }
      if (near(retry, x, y)) { snd.ui(); this.scene.start('Play'); }
    });
    this.events.once('shutdown', off);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (!ready) return; if (cont && (e.key === 'Enter' || e.key === ' ' || e.key === 'c')) goContinue(); else if (e.key === 'Enter' || e.key === ' ' || e.key === 'r') this.scene.start('Play'); });
    if (DemoDriver.enabled) this.time.delayedCall(2500, () => this.scene.start('Play'));
  }
}
