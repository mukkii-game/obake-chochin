import Phaser from 'phaser';
import { t, lang } from '../core/i18n';
import { DemoDriver, expose } from '../core/demo';
import { onTap } from '../ui/taps';
import { snd } from '../game/sound';
import { txt, pop } from '../game/view';
import { W, H } from '../game/logic';

// 3 日を凌いだ後: おばけたちがあの世へ帰っていくエンディングと、スタッフロール。終わったら(タップでも)結果へ
const STAFF: Array<[string, string, string]> = [
  ['企画・ゲームデザイン', 'Concept & Game Design', 'Mukkii'],
  ['プログラム・絵・効果音', 'Code, Art & SFX', 'Claude (Anthropic)'],
  ['音楽', 'Music', '魔王魂 (Maou Damashii)'],
  ['弾ける音', 'Burst Sound', 'Kenney'],
  ['声', 'Voice', 'HTS Voice "Mei" (Nagoya Institute of Technology)\nOpen JTalk'],
  ['文字', 'Fonts', 'Mochiy Pop One / M PLUS Rounded 1c'],
  ['エンジン', 'Engine', 'Phaser'],
];

export class Ending extends Phaser.Scene {
  constructor() { super('Ending'); }

  create(d: Record<string, unknown>) {
    expose('scene', 'Ending');
    this.cameras.main.fadeIn(800, 5, 3, 10);
    this.add.image(0, 0, 'bg').setOrigin(0);
    this.add.image(W - 160, 90, 'moon').setScale(0.6);
    const ja = lang() === 'ja';

    // おばけたち: にこにこ揺れながら、ゆっくり空へ昇って帰っていく
    const kinds = ['g_fuwa', 'g_kasa', 'g_oni', 'g_fuwa', 'g_big', 'g_oni', 'g_kasa', 'g_fuwa'];
    kinds.forEach((k, i) => {
      const x = 110 + i * 105, y = H + 40 + (i % 3) * 30;
      const s = this.add.image(x, y, k).setScale(k === 'g_big' ? 1.2 : 1).setAlpha(0.9);
      this.tweens.add({ targets: s, y: -80, duration: 9000 + i * 700, delay: 600 + i * 450, ease: 'Sine.In' });
      this.tweens.add({ targets: s, x: x + (i % 2 ? 24 : -24), yoyo: true, repeat: -1, duration: 900 + i * 90, ease: 'Sine.InOut' });
    });
    // 花火
    const fw = this.add.particles(0, 0, 'dot', {
      lifespan: { min: 1100, max: 1900 }, speed: { min: 40, max: 160 }, gravityY: 38, scale: { start: 1, end: 0.15 }, alpha: { start: 1, end: 0 },
      tint: [0xffe27a, 0xffb0e0, 0x9ff0ff, 0xb8ffb0, 0xffb347], blendMode: Phaser.BlendModes.ADD, emitting: false,
    });
    this.time.addEvent({ delay: 700, repeat: 14, callback: () => { fw.explode(36, Phaser.Math.Between(140, W - 140), Phaser.Math.Between(80, 260)); snd.chainEnd(3); } });

    // 文: 1 行ずつ出る
    const lines = [t('ending1'), t('ending2'), t('ending3')];
    const story = lines.map((s, i) => {
      const o = this.add.text(W / 2, 150 + i * 80, s, i === 2 ? pop(40, '#ffe27a') : pop(26, '#fff6d8', { align: 'center' })).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 800, delay: 800 + i * 1800 });
      return o;
    });

    // スタッフロール: 文が出そろったら、下から上へ流れる
    const roll = this.add.container(W / 2, H + 20);
    let y = 0;
    roll.add(this.add.text(0, y, t('staffRoll'), pop(34, '#ffb0e0')).setOrigin(0.5, 0)); y += 80;
    for (const [rj, re, name] of STAFF) {
      roll.add(this.add.text(0, y, ja ? rj : re, txt(18, '#c8a0ff')).setOrigin(0.5, 0)); y += 30;
      const n = this.add.text(0, y, name, txt(24, '#ffffff', { align: 'center' })).setOrigin(0.5, 0); roll.add(n); y += n.height + 28;
    }
    y += 40;
    roll.add(this.add.text(0, y, t('thanks'), pop(36, '#ffe27a')).setOrigin(0.5, 0)); y += 60;
    const rollStart = 800 + lines.length * 1800 + 1500;
    this.tweens.add({ targets: story, alpha: 0, delay: rollStart - 600, duration: 600 });
    // 最後の「ありがとう」が画面の真ん中で止まるまで流す
    this.tweens.add({ targets: roll, y: H / 2 - (y - 60), delay: rollStart, duration: y * 22, ease: 'Linear' });

    let done = false;
    const next = () => {
      if (done) return; done = true;
      this.cameras.main.fadeOut(700, 5, 3, 10);
      this.time.delayedCall(750, () => this.scene.start('Result', d));
    };
    const end = rollStart + y * 22 + 2500;
    this.time.delayedCall(end, next);
    let ready = false;
    this.time.delayedCall(1200, () => { ready = true; });
    const off = onTap(() => { if (ready) next(); });
    this.events.once('shutdown', off);
    this.input.keyboard?.on('keydown', () => { if (ready) next(); });
    if (DemoDriver.enabled) this.time.delayedCall(Math.min(end, 9000), next);
  }
}
