// 面を選ぶ。面ごとに★と「手本」。最後に気まぐれ(毎回ちがう都)。
import Phaser from 'phaser';
import { t, lang } from '../core/i18n';
import { load } from '../core/save';
import { expose } from '../core/demo';
import { onTap } from '../ui/taps';
import { snd } from '../game/sound';
import { txt } from '../game/view';
import { W } from '../game/logic';
import { STAGES } from '../game/stages';

export class Select extends Phaser.Scene {
  constructor() { super('Select'); }

  create() {
    expose('scene', 'Select');
    this.cameras.main.fadeIn(300, 5, 3, 10);
    this.add.image(0, 0, 'bg').setOrigin(0);
    this.add.rectangle(W / 2, 285, 820, 440, 0x07060c, 0.6);
    this.add.text(W / 2, 84, t('selectTitle'), txt(30, '#fff1d0')).setOrigin(0.5);
    const stars = load().stars;
    const L = lang();
    const hits: Array<{ r: Phaser.Geom.Rectangle; go: () => void }> = [];
    const rows = [...STAGES.map((st, i) => ({ i, name: st.name[L], idea: st.idea[L], star: stars[st.key] ?? 0, goal: st.goal })), { i: -1, name: t('free'), idea: t('freeIdea'), star: -1, goal: 0 }];
    rows.forEach((row, k) => {
      const y = 128 + k * 56;
      const bg = this.add.rectangle(W / 2 - 40, y + 18, 680, 50, 0x1a1626, 0.85).setStrokeStyle(1, 0x6a5a40, 0.8);
      void bg;
      const label = row.i >= 0 ? `${t('stageNo')}${row.i + 1}${L === 'ja' ? '面' : ''}  ${row.name}` : row.name;
      this.add.text(W / 2 - 370, y + 2, label, txt(20, '#ffe9b0'));
      this.add.text(W / 2 - 370, y + 28, row.idea, txt(12, '#cfc4e0'));
      if (row.star >= 0) {
        this.add.text(W / 2 + 160, y + 4, '★★★'.slice(0, row.star) + '☆☆☆'.slice(0, 3 - row.star), txt(20, '#ffd860'));
        this.add.text(W / 2 + 160, y + 30, `${t('goal')} ${row.goal}${t('chain')}`, txt(11, '#b9b0d0'));
      }
      hits.push({ r: new Phaser.Geom.Rectangle(W / 2 - 380, y - 7, 560, 50), go: () => this.scene.start('Play', { stage: row.i, example: false }) });
      if (row.i >= 0) {
        const ex = this.add.text(W / 2 + 330, y + 18, t('example'), txt(16, '#9cf')).setOrigin(0.5);
        hits.push({ r: Phaser.Geom.Rectangle.Inflate(ex.getBounds(), 18, 12), go: () => this.scene.start('Play', { stage: row.i, example: true }) });
      }
    });
    const back = this.add.text(W / 2, 500, t('toTitle'), txt(16, '#9cf')).setOrigin(0.5);
    hits.push({ r: Phaser.Geom.Rectangle.Inflate(back.getBounds(), 20, 10), go: () => this.scene.start('Title') });

    let ready = false;
    this.time.delayedCall(250, () => { ready = true; });
    const off = onTap((x, y) => {
      if (!ready) return;
      // 手本は行の上に重なるので、後ろ(小さい方)から見る
      for (let i = hits.length - 1; i >= 0; i--) if (hits[i].r.contains(x, y)) { snd.ui(); hits[i].go(); return; }
    });
    this.events.once('shutdown', off);
  }
}
