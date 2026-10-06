// 「動くサンプル」。← → で移動、タップ / スペースで加点。20 秒で終了。
// 作品はこのシーンを丸ごと置き換える。core の使い方の見本として残す。
import Phaser from 'phaser';
import { UnifiedInput } from '../core/input';
import { DemoDriver, expose } from '../core/demo';
import { sfx } from '../core/audio';
import { t } from '../core/i18n';
import { save, load } from '../core/save';
import { tune } from '../core/tuning';

export class Play extends Phaser.Scene {
  private input2!: UnifiedInput;
  private player!: Phaser.GameObjects.Rectangle;
  private score = 0;
  private timeLeft = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private demo!: DemoDriver;

  constructor() { super('Play'); }

  create() {
    expose('scene', 'Play');
    const { width, height } = this.scale;
    this.score = 0; this.timeLeft = tune('game.duration');
    this.cameras.main.setBackgroundColor('#0f2027');
    this.input2 = new UnifiedInput(this);
    this.player = this.add.rectangle(width / 2, height * 0.7, 40, 40, 0x4ecdc4);
    this.scoreText = this.add.text(12, 12, '', { fontSize: '20px', color: '#fff', fontFamily: 'sans-serif' });
    this.timeText = this.add.text(width - 12, 12, '', { fontSize: '20px', color: '#fff', fontFamily: 'sans-serif' }).setOrigin(1, 0);

    // 自動プレイ: 左右に揺れながら 0.4 秒ごとに加点
    let last = 0;
    this.demo = new DemoDriver((tt) => {
      this.player.x = width / 2 + Math.sin(tt / 400) * width * 0.3;
      if (tt - last > 400) { last = tt; this.addScore(); }
    });
    this.updateHud();
  }

  private addScore() {
    this.score += tune('score.per'); sfx.score(); expose('score', this.score);
    this.tweens.add({ targets: this.player, scale: tune('juice.pop'), yoyo: true, duration: 80 });
  }

  private updateHud() {
    this.scoreText.setText(`${t('score')}: ${this.score}`);
    this.timeText.setText(`${Math.ceil(this.timeLeft)}`);
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.input2.update();
    const s = this.input2.state;
    const speed = tune('player.speed');
    const dx = (s.right ? 1 : 0) - (s.left ? 1 : 0) + s.axisX;
    this.player.x = Phaser.Math.Clamp(this.player.x + dx * speed * dt, 20, this.scale.width - 20);
    if (s.action) this.addScore();
    this.demo.update(deltaMs);

    this.timeLeft -= dt;
    this.updateHud();
    if (this.timeLeft <= 0) {
      const best = Math.max(load().best, this.score);
      save({ best, played: load().played + 1 });
      sfx.over();
      this.scene.start('Result', { score: this.score, best });
    }
  }
}
