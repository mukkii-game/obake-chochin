// スマホ用の仮想ボタン。左半面ドラッグは core/input が拾うので、ここは補助表示のみ。
import Phaser from 'phaser';

export function addTouchHint(scene: Phaser.Scene, text: string) {
  if (!scene.sys.game.device.input.touch) return;
  const { width, height } = scene.scale;
  scene.add.text(width / 2, height - 28, text, {
    fontSize: '14px', color: '#aaaaaa', fontFamily: 'sans-serif',
  }).setOrigin(0.5).setAlpha(0.8);
}
